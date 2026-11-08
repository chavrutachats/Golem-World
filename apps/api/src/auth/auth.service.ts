import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@trivia/db';
import { DEFAULT_LOCALE, LIVES_RULES, livesAt, localeFromTag, lookFromItems, type AuthTokens, type Locale, type MeResponse } from '@trivia/shared';
import { createHmac } from 'node:crypto';
import { Errors } from '../common/http.js';
import { CLOCK, PRISMA, RANDOM, type Clock, type RandomSource } from '../common/infra.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { LIMITS } from '../security/rate-limit.js';
import { RateLimitService } from '../security/rate-limit.service.js';
import { normalizeEmail } from './email.js';
import { DUMMY_HASH, hashPassword, needsRehash, newPasswordProblem, verifyPassword } from './passwords.js';
import { toPublicUser, TokensService } from './tokens.service.js';

@Injectable()
export class AuthService {
  private readonly log = new Logger('security');

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(RANDOM) private readonly random: RandomSource,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  /**
   * Chave dos limites por conta: HMAC do e-mail com um segredo do servidor. O e-mail
   * não fica em memória nem em log, e quem lê o log não consegue testar e-mails
   * candidatos contra a chave (o que daria com um hash simples).
   */
  private accountKey(email: string): string {
    return `acct:${createHmac('sha256', this.config.jwt.refreshSecret).update(`ratelimit:${email}`).digest('hex').slice(0, 24)}`;
  }

  /** Conta de convidado: joga na hora, sem e-mail. Pode virar conta completa depois. */
  async guest(displayName?: string, locale: Locale = DEFAULT_LOCALE): Promise<AuthTokens> {
    const fallback = { pt: 'Visitante', en: 'Guest', he: 'Guest' }[locale];
    const name = displayName ?? `${fallback} ${1000 + this.random.int(9000)}`;
    const user = await this.prisma.user.create({ data: { displayName: name, isGuest: true, locale } });
    return this.tokens.issue(user);
  }

  /**
   * Cadastro com e-mail e senha. Se quem chama já é um convidado autenticado,
   * a própria conta de convidado é promovida e mantém pontos e partidas.
   */
  async register(
    input: { email: string; password: string; displayName: string; locale?: Locale },
    currentUserId: string | null,
  ): Promise<AuthTokens> {
    const email = normalizeEmail(input.email);
    const weak = newPasswordProblem(input.password, { email, displayName: input.displayName });
    if (weak) throw Errors.unprocessable('WEAK_PASSWORD', weak);
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw Errors.conflict('EMAIL_TAKEN', 'Este e-mail já está cadastrado.');
    }
    const passwordHash = await hashPassword(input.password);
    const current = currentUserId ? await this.prisma.user.findUnique({ where: { id: currentUserId } }) : null;
    try {
      const user =
        current && current.isGuest && !current.deletedAt
          ? await this.prisma.user.update({
              where: { id: current.id },
              data: { email, passwordHash, displayName: input.displayName, isGuest: false, registeredAt: this.clock.now(), ...(input.locale ? { locale: input.locale } : {}) },
            })
          : await this.prisma.user.create({
              data: { email, passwordHash, displayName: input.displayName, isGuest: false, registeredAt: this.clock.now(), locale: input.locale ?? DEFAULT_LOCALE },
            });
      return await this.tokens.issue(user);
    } catch (error) {
      // Dois cadastros simultâneos com o mesmo e-mail: o índice único decide.
      if ((error as { code?: string }).code === 'P2002') throw Errors.conflict('EMAIL_TAKEN', 'Este e-mail já está cadastrado.');
      throw error;
    }
  }

  /**
   * Login com limite de senhas erradas: 5 por conta e endereço em 15 min (o jogador
   * que esqueceu a senha) e 30 por conta em 1 h vindo de qualquer lugar (ataque
   * distribuído). O limite conta mesmo para e-mails sem conta, então o bloqueio
   * não revela quais e-mails existem.
   *
   * A tentativa é contada ANTES de conferir a senha (que é lenta de propósito): assim
   * várias tentativas em paralelo não passam todas pela checagem. Se a senha estiver
   * certa, a tentativa é devolvida.
   */
  async login(emailRaw: string, password: string, clientKey: string): Promise<AuthTokens> {
    const email = normalizeEmail(emailRaw);
    const acct = this.accountKey(email);
    const acctIp = `${acct}|${clientKey}`;
    const blocked = 'Muitas tentativas de login nesta conta.';
    this.limits.consume(LIMITS.loginFailuresPerAccountIp, acctIp, blocked);
    try {
      this.limits.consume(LIMITS.loginFailuresPerAccount, acct, blocked);
    } catch (error) {
      this.limits.refund(LIMITS.loginFailuresPerAccountIp, acctIp);
      throw error;
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || user.deletedAt || !valid) {
      throw Errors.unauthorized('E-mail ou senha incorretos.');
    }
    this.limits.reset(LIMITS.loginFailuresPerAccountIp, acctIp);
    this.limits.refund(LIMITS.loginFailuresPerAccount, acct);
    const fresh = needsRehash(user.passwordHash)
      ? await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } })
      : user;
    return this.tokens.issue(fresh);
  }

  refresh(refreshToken: string): Promise<AuthTokens> {
    return this.tokens.rotate(refreshToken);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }

  /** "Sair de todos os aparelhos": derruba todas as sessões, inclusive esta. */
  async logoutAll(userId: string): Promise<void> {
    await this.tokens.revokeAll(userId);
    this.log.log(`todas as sessões encerradas a pedido do usuário ${userId}`);
  }

  /**
   * Troca de senha: exige a senha atual, encerra todas as outras sessões e devolve
   * tokens novos para este aparelho continuar conectado.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw Errors.unauthorized();
    if (user.isGuest || !user.passwordHash) {
      throw Errors.unprocessable('GUEST_ACCOUNT', 'Convidados não têm senha. Crie uma conta no seu perfil.');
    }
    // 422, e não 401: o app trata 401 como "sessão vencida" e tentaria renovar.
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw Errors.unprocessable('WRONG_PASSWORD', 'A senha atual está incorreta.');
    }
    if (currentPassword === newPassword) {
      throw Errors.unprocessable('SAME_PASSWORD', 'A senha nova precisa ser diferente da atual.');
    }
    const weak = newPasswordProblem(newPassword, { email: user.email, displayName: user.displayName });
    if (weak) throw Errors.unprocessable('WEAK_PASSWORD', weak);
    const passwordHash = await hashPassword(newPassword);
    const tokens = await this.prisma.$transaction(async (tx) => {
      await this.tokens.revokeAll(userId, tx);
      const u = await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      return this.tokens.issue(u, tx);
    });
    this.log.log(`senha trocada; outras sessões encerradas (usuário ${userId})`);
    return tokens;
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { identities: { select: { provider: true } } } });
    if (!user || user.deletedAt) throw Errors.unauthorized();
    const seats = await this.prisma.gamePlayer.findMany({ where: { userId }, select: { id: true } });
    const [gamesPlayed, wins, answered, correct] = await Promise.all([
      this.prisma.gamePlayer.count({ where: { userId, game: { status: 'finished' } } }),
      this.prisma.game.count({ where: { status: 'finished', winnerPlayerId: { in: seats.map((s) => s.id) } } }),
      this.prisma.questionPlay.count({ where: { userId, answeredAt: { not: null } } }),
      this.prisma.questionPlay.count({ where: { userId, isCorrect: true } }),
    ]);
    const items = await this.prisma.userItem.findMany({ where: { userId }, select: { itemId: true, equipped: true } });
    const lives = livesAt(user.lives, user.livesUpdatedAt, this.clock.now());
    return {
      ...toPublicUser(user),
      email: user.email,
      hasPassword: !!user.passwordHash,
      identities: user.identities.map((i) => i.provider),
      locale: localeFromTag(user.locale),
      lives: { lives: lives.lives, max: LIVES_RULES.max, nextLifeAt: lives.nextLifeAt?.toISOString() ?? null },
      coins: user.coins,
      golem: lookFromItems(items),
      stats: { gamesPlayed, wins, answered, correct },
    };
  }

  async updateMe(userId: string, patch: { displayName?: string; locale?: Locale }): Promise<MeResponse> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}), ...(patch.locale ? { locale: patch.locale } : {}) },
    });
    return this.me(userId);
  }
}
