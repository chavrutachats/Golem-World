/**
 * Tokens de acesso (JWT HS256, curtos) e de renovação (opacos, longos, guardados só
 * como HMAC no banco).
 *
 * - O token de acesso leva `sv`, a versão de sessão do usuário. A cada requisição o
 *   guard confere essa versão no banco, então aumentar `User.sessionVersion` derruba
 *   na hora todos os tokens de acesso já emitidos, sem esperar os 15 minutos.
 * - A renovação gira o token a cada uso. Logo depois de girar, o token anterior ainda pode
 *   ser trocado UMA vez por um par novo (REUSE_GRACE_MS: resposta perdida na rede, duas
 *   abas do navegador). Qualquer outro reuso indica vazamento: todas as sessões do usuário
 *   são encerradas, inclusive os tokens de acesso.
 * - Cada conta tem no máximo `MAX_SESSIONS` sessões abertas; abrir mais encerra as
 *   mais antigas.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, PrismaClient, User } from '@trivia/db';
import type { AuthTokens, PublicUser } from '@trivia/shared';
import { jwtVerify, SignJWT } from 'jose';
import { createHmac, randomBytes } from 'node:crypto';
import { CLOCK, PRISMA, type Clock } from '../common/infra.js';
import { Errors, type AuthUser } from '../common/http.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { REUSE_GRACE_MS, revokeAllSessions } from './sessions.js';

export { REUSE_GRACE_MS };

const ISSUER = 'trivia-torah';
const AUDIENCE = 'trivia-app';
export const MAX_SESSIONS = 10;

type Db = PrismaClient | Prisma.TransactionClient;

export function toPublicUser(user: Pick<User, 'id' | 'displayName' | 'isGuest' | 'totalPoints'>): PublicUser {
  return { id: user.id, displayName: user.displayName, isGuest: user.isGuest, totalPoints: user.totalPoints };
}

@Injectable()
export class TokensService {
  private readonly accessKey: Uint8Array;
  private readonly log = new Logger('security');

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.accessKey = new TextEncoder().encode(config.jwt.accessSecret);
  }

  private hashRefresh(token: string): string {
    return createHmac('sha256', this.config.jwt.refreshSecret).update(token).digest('hex');
  }

  async signAccess(user: Pick<User, 'id' | 'sessionVersion'>): Promise<string> {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    return new SignJWT({ sv: user.sessionVersion })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + this.config.jwt.accessTtlSeconds)
      .sign(this.accessKey);
  }

  /**
   * Confere assinatura, emissor, público e validade do token, e depois o banco:
   * a conta existe, não foi excluída e a versão de sessão bate. O papel (jogador,
   * revisor) vem do banco, nunca do token.
   */
  async verifyAccess(token: string): Promise<AuthUser> {
    let sub: string;
    let sv: number;
    try {
      const { payload } = await jwtVerify(token, this.accessKey, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
        currentDate: this.clock.now(),
        requiredClaims: ['sub', 'exp', 'iat'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sv !== 'number') throw new Error('payload');
      sub = payload.sub;
      sv = payload.sv;
    } catch {
      throw Errors.unauthorized('Sessão expirada. Faça login novamente.');
    }
    if (!/^[0-9a-f-]{36}$/i.test(sub)) throw Errors.unauthorized();
    const user = await this.prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, role: true, sessionVersion: true, deletedAt: true },
    });
    if (!user || user.deletedAt || user.sessionVersion !== sv) {
      throw Errors.unauthorized('Sessão encerrada. Faça login novamente.');
    }
    return { id: user.id, role: user.role };
  }

  async issue(user: User, db: Db = this.prisma): Promise<AuthTokens> {
    const now = this.clock.now();
    const refreshToken = randomBytes(48).toString('base64url');
    await db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefresh(refreshToken),
        expiresAt: new Date(now.getTime() + this.config.jwt.refreshTtlSeconds * 1000),
      },
    });
    // Mantém só as MAX_SESSIONS sessões mais recentes.
    const active = await db.refreshToken.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
      skip: MAX_SESSIONS,
    });
    if (active.length) {
      await db.refreshToken.updateMany({
        where: { id: { in: active.map((t) => t.id) } },
        data: { revokedAt: now, revokedReason: 'limit' },
      });
    }
    return { accessToken: await this.signAccess(user), refreshToken, user: toPublicUser(user) };
  }

  async rotate(refreshToken: string): Promise<AuthTokens> {
    const now = this.clock.now();
    const tokenHash = this.hashRefresh(refreshToken);
    const find = () => this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
    const stored = await find();
    if (!stored || stored.user.deletedAt) throw Errors.unauthorized();
    if (!stored.revokedAt) {
      if (stored.expiresAt <= now) throw Errors.unauthorized();
      const claimed = await this.prisma.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'rotated' },
      });
      if (claimed.count === 1) return this.issue(stored.user);
      // Outra renovação com o mesmo token ganhou a corrida: segue como reuso (com tolerância).
    }
    const current = stored.revokedAt ? stored : await find();
    if (!current?.revokedAt) throw Errors.unauthorized();
    return this.handleReuse(current, current.revokedAt, now);
  }

  /**
   * Token já revogado apresentado de novo. Girado há pouco e ainda não reemitido:
   * troca UMA vez por um par novo. Girado antes (ou já reemitido): vazou, derruba tudo.
   * Revogado por logout, limite de sessões ou "sair de todos": só recusa.
   */
  private async handleReuse(
    stored: { id: string; userId: string; revokedReason: string | null; expiresAt: Date; user: User },
    revokedAt: Date,
    now: Date,
  ): Promise<AuthTokens> {
    const inGrace = stored.revokedReason === 'rotated' && now.getTime() - revokedAt.getTime() <= REUSE_GRACE_MS && stored.expiresAt > now;
    if (inGrace) {
      const regraced = await this.prisma.refreshToken.updateMany({
        where: { id: stored.id, revokedReason: 'rotated' },
        data: { revokedReason: 'grace' },
      });
      if (regraced.count === 1) {
        const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
        if (!user || user.deletedAt) throw Errors.unauthorized();
        return this.issue(user);
      }
    }
    if (stored.revokedReason === 'rotated' || stored.revokedReason === 'grace') {
      await this.revokeAll(stored.userId);
      this.log.warn(`refresh token reutilizado; todas as sessões encerradas (usuário ${stored.userId})`);
    }
    throw Errors.unauthorized();
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashRefresh(refreshToken), revokedAt: null },
      data: { revokedAt: this.clock.now(), revokedReason: 'logout' },
    });
  }

  /** Encerra todas as sessões: refresh tokens revogados e tokens de acesso invalidados. */
  async revokeAll(userId: string, db: Db = this.prisma): Promise<void> {
    await revokeAllSessions(db, userId, this.clock.now());
  }
}
