/**
 * Denúncias de perguntas pelos jogadores, depois de responder.
 *
 * Política (docs/CONTENT_POLICY.md):
 *  - Desrespeito denunciado por um jogador CONFIÁVEL tira a pergunta de circulação na
 *    hora; outros motivos tiram quando 3 jogadores confiáveis diferentes denunciam.
 *  - Confiável = conta cadastrada (não convidado) há pelo menos 3 dias, com 30
 *    perguntas respondidas (revisores sempre). Contas de convidado são grátis e
 *    ilimitadas; sem essa regra, um script poderia esvaziar o jogo denunciando tudo.
 *  - Denúncias de quem ainda não é confiável vão para a fila de revisão, as de
 *    desrespeito no topo, e não tiram a pergunta sozinhas.
 *  - Disjuntor: no máximo 20 retiradas automáticas por dia no jogo todo, e 5 por
 *    denunciante. Passou disso, as denúncias só vão para a fila (e o log avisa).
 *  - Cada jogador faz no máximo 20 denúncias por dia.
 * Perguntas retiradas voltam para a fila de revisão humana.
 */
import { Body, Controller, HttpCode, Inject, Injectable, Logger, Module, Post, UseGuards } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@trivia/db';
import { ReportQuestionRequestSchema } from '@trivia/shared';
import type { z } from 'zod';
import { AuthModule } from '../auth/auth.module.js';
import { AuthGuard } from '../auth/guards.js';
import { CurrentUser, Errors, ZodPipe, type AuthUser } from '../common/http.js';
import { CLOCK, PRISMA, type Clock } from '../common/infra.js';
import { LIMITS } from '../security/rate-limit.js';
import { UserLimit } from '../security/rate-limit.guards.js';
import { GameModule } from '../game/game.module.js';
import { QuestionSelector } from '../game/question-selector.service.js';

export const REPORT_RULES = {
  /** Denúncias confiáveis (de jogadores diferentes) que tiram a pergunta de circulação. */
  retireAfterTrustedReports: 3,
  trustedMinAccountAgeMs: 3 * 24 * 60 * 60 * 1000,
  trustedMinAnswered: 30,
  /** Disjuntor: retiradas automáticas por dia, no jogo todo e por denunciante. */
  maxAutoRetirementsPerDay: 20,
  maxAutoRetirementsPerReporterPerDay: 5,
  maxReportsPerUserPerDay: 20,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ReportsService {
  private readonly log = new Logger('security');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(QuestionSelector) private readonly selector: QuestionSelector,
  ) {}

  /** Denunciante confiável: conta cadastrada, com idade e histórico mínimos (revisores sempre). */
  async isTrusted(userId: string, now: Date): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isGuest: true, role: true, registeredAt: true, deletedAt: true } });
    if (!user || user.deletedAt) return false;
    if (user.role === 'reviewer' || user.role === 'admin') return true;
    // A idade conta a partir do cadastro com e-mail, não da criação do convidado: um
    // convidado "envelhecido" por script não vira confiável no instante em que se cadastra.
    if (user.isGuest || !user.registeredAt) return false;
    if (now.getTime() - user.registeredAt.getTime() < REPORT_RULES.trustedMinAccountAgeMs) return false;
    const answered = await this.prisma.questionPlay.count({ where: { userId, answeredAt: { not: null } } });
    return answered >= REPORT_RULES.trustedMinAnswered;
  }

  async report(userId: string, input: z.infer<typeof ReportQuestionRequestSchema>) {
    const now = this.clock.now();
    const play = await this.prisma.questionPlay.findUnique({ where: { id: input.playId } });
    if (!play || play.userId !== userId) throw Errors.notFound('Pergunta não encontrada.');
    if (!play.answeredAt) throw Errors.conflict('NOT_ANSWERED', 'Responda a pergunta antes de denunciá-la.');
    const existing = await this.prisma.questionReport.findUnique({
      where: { userId_questionId: { userId, questionId: play.questionId } },
    });
    if (existing) throw Errors.conflict('ALREADY_REPORTED', 'Você já denunciou esta pergunta. Obrigado!');

    // Limite diário guardado no banco (vale mesmo com várias instâncias da API).
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const today = await this.prisma.questionReport.count({ where: { userId, createdAt: { gte: dayAgo } } });
    if (today >= REPORT_RULES.maxReportsPerUserPerDay) {
      throw Errors.rateLimitedUntil(DAY_MS, 'Você já enviou muitas denúncias hoje. Obrigado pela ajuda! Tente de novo amanhã.');
    }

    const trusted = await this.isTrusted(userId, now);
    const report = await this.prisma.questionReport.create({
      data: {
        questionId: play.questionId,
        userId,
        playId: play.id,
        reason: input.reason,
        trusted,
        ...(input.comment ? { comment: input.comment } : {}),
      },
    });

    let retired = false;
    if (trusted) {
      const trustedOpen = await this.prisma.questionReport.count({
        where: { questionId: play.questionId, resolvedAt: null, trusted: true },
      });
      const wantsRetire = input.reason === 'disrespectful' || trustedOpen >= REPORT_RULES.retireAfterTrustedReports;
      if (wantsRetire) {
        // Conferir o disjuntor e retirar numa transação com trava: denúncias simultâneas
        // não passam todas pelo limite diário.
        retired = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('trivia:report-breaker'))`;
          if (!(await this.breakerAllows(tx, userId, dayAgo))) return false;
          const changed = await tx.question.updateMany({
            where: { id: play.questionId, status: 'approved' },
            data: { status: 'retired' },
          });
          if (changed.count === 0) return false;
          await tx.questionReport.update({ where: { id: report.id }, data: { triggeredRetirement: true } });
          return true;
        });
        if (retired) this.selector.invalidateAvailability();
      }
    }
    return { received: true, retired };
  }

  /** Disjuntor de retiradas automáticas (no jogo todo e por denunciante). */
  private async breakerAllows(tx: Prisma.TransactionClient, userId: string, since: Date): Promise<boolean> {
    const [total, mine] = await Promise.all([
      tx.questionReport.count({ where: { triggeredRetirement: true, createdAt: { gte: since } } }),
      tx.questionReport.count({ where: { triggeredRetirement: true, userId, createdAt: { gte: since } } }),
    ]);
    if (total >= REPORT_RULES.maxAutoRetirementsPerDay) {
      this.log.warn('disjuntor de denúncias: limite diário de retiradas automáticas atingido; denúncias só vão para a fila');
      return false;
    }
    if (mine >= REPORT_RULES.maxAutoRetirementsPerReporterPerDay) {
      this.log.warn(`disjuntor de denúncias: usuário ${userId} atingiu o limite diário de retiradas automáticas`);
      return false;
    }
    return true;
  }
}

@Controller('questions')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Post('report')
  @HttpCode(201)
  @UserLimit(LIMITS.report)
  report(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(ReportQuestionRequestSchema)) body: z.infer<typeof ReportQuestionRequestSchema>,
  ) {
    return this.reports.report(user.id, body);
  }
}

@Module({
  imports: [AuthModule, GameModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
