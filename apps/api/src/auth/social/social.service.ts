/**
 * Login com Google, Apple e Facebook (Fase 10).
 *
 * - Sem sessão: entra na conta ligada a esse login; se não houver, cria uma conta nova.
 * - Com sessão (convidado ou conta completa): liga o login à conta atual. O convidado
 *   vira conta completa e mantém pontos, partidas, moedas e itens.
 *
 * Nada de ligar contas pelo e-mail sem o jogador pedir: se o e-mail confirmado pelo
 * provedor já é de uma conta com senha, o jogador entra com a senha e conecta o
 * provedor no perfil. Juntar automaticamente pelo e-mail abriria a porta para quem
 * controla um e-mail num provedor tomar uma conta de outro lugar.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuthProvider, PrismaClient } from '@trivia/db';
import {
  DEFAULT_LOCALE,
  DISPLAY_NAME_MAX,
  DisplayNameSchema,
  SOCIAL_PROVIDERS,
  type AuthProviders,
  type AuthTokens,
  type Locale,
  type SocialLoginRequest,
  type SocialProvider,
} from '@trivia/shared';
import { Errors } from '../../common/http.js';
import { CLOCK, PRISMA, RANDOM, type Clock, type RandomSource } from '../../common/infra.js';
import { TokensService } from '../tokens.service.js';
import type { SocialVerifier } from './verifiers.js';

export const SOCIAL_VERIFIERS = Symbol('SOCIAL_VERIFIERS');
export type SocialVerifiers = Partial<Record<SocialProvider, SocialVerifier>>;

const PROVIDER_NAMES: Readonly<Record<SocialProvider, string>> = { google: 'Google', apple: 'Apple', facebook: 'Facebook' };

@Injectable()
export class SocialAuthService {
  private readonly log = new Logger('security');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RANDOM) private readonly random: RandomSource,
    @Inject(SOCIAL_VERIFIERS) private readonly verifiers: SocialVerifiers,
  ) {}

  providers(): AuthProviders {
    return Object.fromEntries(SOCIAL_PROVIDERS.map((p) => [p, !!this.verifiers[p]])) as AuthProviders;
  }

  /**
   * Nome público da conta nova: só o primeiro nome que o provedor informa (o nome
   * completo apareceria no ranking), dentro das regras de nome; senão, um genérico.
   */
  private displayNameFor(raw: string | null | undefined, locale: Locale): string {
    const first = raw?.normalize('NFC').trim().split(/\s+/)[0]?.slice(0, DISPLAY_NAME_MAX);
    if (first && DisplayNameSchema.safeParse(first).success) return first;
    const fallback = { pt: 'Jogador', en: 'Player', he: 'Player' }[locale];
    return `${fallback} ${1000 + this.random.int(9000)}`;
  }

  async signIn(input: SocialLoginRequest, currentUserId: string | null): Promise<AuthTokens> {
    const verifier = this.verifiers[input.provider];
    if (!verifier) throw Errors.conflict('PROVIDER_OFF', 'Este tipo de login não está disponível.');
    const profile = await verifier.verify({ token: input.token, nonce: input.nonce });
    const provider = input.provider as AuthProvider;
    const name = PROVIDER_NAMES[input.provider];
    const now = this.clock.now();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const identity = await tx.userIdentity.findUnique({ where: { provider_subject: { provider, subject: profile.subject } }, include: { user: true } });

        // --- Ligando a uma conta já aberta neste aparelho ---------------------------------
        if (currentUserId) {
          const current = await tx.user.findUnique({ where: { id: currentUserId } });
          if (!current || current.deletedAt) throw Errors.unauthorized();
          if (identity && identity.userId !== current.id) {
            throw Errors.conflict('IDENTITY_IN_USE', 'Este login com {provider} já está ligado a outro jogador. Saia desta conta e entre com {provider}.', { provider: name });
          }
          if (!identity) {
            if (await tx.userIdentity.findUnique({ where: { userId_provider: { userId: current.id, provider } } })) {
              throw Errors.conflict('PROVIDER_ALREADY_LINKED', 'Sua conta já tem outro login com {provider} ligado.', { provider: name });
            }
            await tx.userIdentity.create({ data: { userId: current.id, provider, subject: profile.subject, email: profile.email } });
          } else {
            await tx.userIdentity.update({ where: { id: identity.id }, data: { lastUsedAt: now } });
          }
          // O convidado vira conta completa (e ganha o e-mail confirmado, se ninguém o usa).
          const emailFree = profile.email && !current.email && !(await tx.user.findUnique({ where: { email: profile.email } }));
          const user = current.isGuest
            ? await tx.user.update({
                where: { id: current.id },
                data: { isGuest: false, registeredAt: current.registeredAt ?? now, ...(emailFree ? { email: profile.email } : {}) },
              })
            : current;
          this.log.log(`login ${input.provider} ligado à conta ${user.id}`);
          return this.tokens.issue(user, tx);
        }

        // --- Entrando ----------------------------------------------------------------------
        if (identity) {
          if (identity.user.deletedAt) throw Errors.unauthorized('Esta conta foi excluída.');
          await tx.userIdentity.update({ where: { id: identity.id }, data: { lastUsedAt: now } });
          return this.tokens.issue(identity.user, tx);
        }
        if (profile.email && (await tx.user.findUnique({ where: { email: profile.email } }))) {
          throw Errors.conflict(
            'ACCOUNT_EXISTS',
            'Já existe uma conta com o e-mail deste login. Entre com e-mail e senha e conecte o login com {provider} no seu perfil.',
            { provider: name },
          );
        }
        const locale = input.locale ?? DEFAULT_LOCALE;
        const user = await tx.user.create({
          data: {
            displayName: this.displayNameFor(profile.name ?? input.displayName, locale),
            isGuest: false,
            registeredAt: now,
            locale,
            email: profile.email,
          },
        });
        await tx.userIdentity.create({ data: { userId: user.id, provider, subject: profile.subject, email: profile.email } });
        this.log.log(`conta nova pelo login ${input.provider}: ${user.id}`);
        return this.tokens.issue(user, tx);
      });
    } catch (e) {
      // Dois toques ao mesmo tempo no mesmo login: o índice único decide; o segundo entra na conta criada.
      if ((e as { code?: string }).code === 'P2002' && !currentUserId) {
        const identity = await this.prisma.userIdentity.findUnique({ where: { provider_subject: { provider, subject: profile.subject } }, include: { user: true } });
        if (identity && !identity.user.deletedAt) return this.tokens.issue(identity.user);
      }
      throw e;
    }
  }

  /** Desliga um login. Só se sobrar outro jeito de entrar (senha ou outro login). */
  async unlink(userId: string, provider: SocialProvider): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, include: { identities: { select: { provider: true } } } });
      if (!user || user.deletedAt) throw Errors.unauthorized();
      if (!user.identities.some((i) => i.provider === provider)) throw Errors.notFound('Este login não está ligado à sua conta.');
      if (!user.passwordHash && user.identities.length <= 1) {
        throw Errors.conflict('LAST_LOGIN', 'Este é o único jeito de entrar na sua conta. Ligue outro login antes de desligar este.');
      }
      await tx.userIdentity.delete({ where: { userId_provider: { userId, provider: provider as AuthProvider } } });
    });
  }
}
