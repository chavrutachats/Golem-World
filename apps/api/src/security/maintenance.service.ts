/**
 * Limpeza periódica, para o banco não crescer sem limite nem guardar dado à toa:
 *  - refresh tokens vencidos há mais de 1 dia;
 *  - convites (partida com amigo ou aleatória) parados há mais de 7 dias sem adversário;
 *  - convidados com mais de 30 dias que nunca jogaram e não têm sessão ativa.
 *
 * Roda a cada 6 horas no processo da API (desligue com MAINTENANCE_ENABLED=false se
 * preferir rodar fora, por exemplo num cron que chame `runOnce`).
 */
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type { PrismaClient } from '@trivia/db';
import { CLOCK, PRISMA, type Clock } from '../common/infra.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { INVITE_VALIDITY_MS } from '../game/game.service.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const MAINTENANCE_RULES = {
  everyMs: 6 * HOUR,
  expiredTokenGraceMs: DAY,
  staleInviteMs: INVITE_VALIDITY_MS,
  idleGuestMs: 30 * DAY,
} as const;

export interface MaintenanceReport {
  tokensDeleted: number;
  invitesClosed: number;
  guestsDeleted: number;
}

@Injectable()
export class MaintenanceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('maintenance');
  private timer: NodeJS.Timeout | null = null;
  private first: NodeJS.Timeout | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.maintenanceEnabled) return;
    const run = () => void this.runOnce().catch((error: unknown) => this.log.error(`limpeza falhou: ${String(error)}`));
    this.first = setTimeout(run, 60_000);
    this.first.unref();
    this.timer = setInterval(run, MAINTENANCE_RULES.everyMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<MaintenanceReport> {
    const now = this.clock.now().getTime();
    const tokens = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date(now - MAINTENANCE_RULES.expiredTokenGraceMs) } },
    });
    const invites = await this.prisma.game.updateMany({
      where: { status: 'waiting_opponent', createdAt: { lt: new Date(now - MAINTENANCE_RULES.staleInviteMs) } },
      data: { status: 'abandoned', finishedAt: new Date(now), inviteCode: null },
    });
    const guests = await this.prisma.user.deleteMany({
      where: {
        isGuest: true,
        role: 'player',
        createdAt: { lt: new Date(now - MAINTENANCE_RULES.idleGuestMs) },
        gameSeats: { none: {} },
        reports: { none: {} },
        refreshTokens: { none: { revokedAt: null, expiresAt: { gt: new Date(now) } } },
      },
    });
    const report = { tokensDeleted: tokens.count, invitesClosed: invites.count, guestsDeleted: guests.count };
    if (report.tokensDeleted || report.invitesClosed || report.guestsDeleted) {
      this.log.log(
        `limpeza: ${report.tokensDeleted} token(s) vencido(s), ${report.invitesClosed} convite(s) parado(s), ${report.guestsDeleted} convidado(s) sem uso`,
      );
    }
    return report;
  }
}
