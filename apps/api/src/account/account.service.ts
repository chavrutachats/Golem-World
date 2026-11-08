/**
 * Exclusão de conta a pedido do usuário (LGPD art. 18, VI; App Store 5.1.1(v);
 * política de exclusão de conta do Google Play).
 *
 * O que acontece:
 *  - Partidas em andamento: o usuário desiste (o adversário vence; convites abertos
 *    são cancelados). Isso acontece depois de a conta ser marcada como excluída, para
 *    nenhum outro aparelho da pessoa abrir partida nova no meio do caminho.
 *  - Dados pessoais apagados: e-mail, senha, apelido, pontos, todas as sessões e os
 *    comentários escritos em denúncias.
 *  - A linha do usuário fica anonimizada ("Conta excluída", sem e-mail nem senha) em
 *    vez de apagada, para não destruir o histórico das partidas dos adversários.
 *    Dado anonimizado não é dado pessoal (LGPD art. 12).
 *  - O e-mail fica livre para um cadastro novo.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@trivia/db';
import { verifyPassword } from '../auth/passwords.js';
import { Errors } from '../common/http.js';
import { CLOCK, PRISMA, type Clock } from '../common/infra.js';
import { GameService } from '../game/game.service.js';

export const DELETED_DISPLAY_NAME = 'Conta excluída';

@Injectable()
export class AccountService {
  private readonly log = new Logger('security');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GameService) private readonly games: GameService,
  ) {}

  async deleteAccount(userId: string, password: string | undefined): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw Errors.unauthorized();
    if (!user.isGuest && user.passwordHash) {
      if (!password) throw Errors.unprocessable('PASSWORD_REQUIRED', 'Confirme a exclusão com a sua senha.');
      // 422, e não 401: o app trata 401 como "sessão vencida" e tentaria renovar.
      if (!(await verifyPassword(password, user.passwordHash))) {
        throw Errors.unprocessable('WRONG_PASSWORD', 'Senha incorreta.');
      }
    }

    // Primeiro a conta deixa de existir (sessões caem na hora, nenhum outro aparelho
    // consegue criar ou entrar em partida); depois as partidas abertas são encerradas.
    const now = this.clock.now();
    await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      // Os logins sociais se soltam: a mesma conta do Google pode criar um jogador novo depois.
      this.prisma.userIdentity.deleteMany({ where: { userId } }),
      this.prisma.questionReport.updateMany({ where: { userId }, data: { comment: null } }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          displayName: DELETED_DISPLAY_NAME,
          email: null,
          passwordHash: null,
          role: 'player',
          totalPoints: 0,
          deletedAt: now,
          sessionVersion: { increment: 1 },
        },
      }),
    ]);
    const forfeited = await this.games.forfeitAllForUser(userId);
    this.log.log(`conta excluída a pedido do usuário ${userId} (${forfeited} partida(s) encerrada(s))`);
  }
}
