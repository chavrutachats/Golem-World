/**
 * Cliente HTTP da API, sem dependências de React Native (testável em Node).
 *
 * - Toda resposta é validada com os schemas de @trivia/shared: se a API mudar o
 *   formato, o erro aparece aqui com clareza, e não como tela quebrada.
 * - O token de acesso fica só em memória; o de renovação, no armazenamento seguro.
 * - Renovação "de voo único": várias requisições que recebem 401 ao mesmo tempo
 *   esperam UMA renovação. Isso importa porque a API gira o refresh token a cada uso
 *   e encerra todas as sessões se um token antigo for reutilizado.
 * - A sessão guardada só é apagada quando a API diz que ela acabou (401). Rede fora,
 *   limite de requisições (429) ou erro do servidor mantêm o token: para um convidado,
 *   apagar o token seria perder a conta.
 * - Em produção (`requireHttps`), só conversa com a API por https (ou com o próprio
 *   aparelho, em localhost, para testar o build de produção no computador).
 */
import {
  PuzzleFinishResultSchema,
  PuzzleOverviewSchema,
  PuzzleRunSchema,
  type PuzzleFinishResult,
  type PuzzleMove,
  type PuzzleOverview,
  type PuzzleRun,
  AuthProvidersSchema,
  type AuthProviders,
  type SocialLoginRequest,
  type SocialProvider,
  AdBreakResultSchema,
  EconomyStateSchema,
  PurchaseResultSchema,
  RewardClaimResultSchema,
  RewardTicketSchema,
  type AdBreakResult,
  type AdPlacement,
  type EconomyState,
  type JourneyPower,
  type PurchaseRequest,
  type PurchaseResult,
  type RewardClaimResult,
  type RewardTicket,
  AnswerResultSchema,
  AuthTokensSchema,
  GameStateSchema,
  GameSummarySchema,
  JourneyAnswerResultSchema,
  JourneyQuestionSchema,
  JourneyRunSchema,
  JourneyStateSchema,
  MeResponseSchema,
  PowerUpResultSchema,
  PrepStatusSchema,
  ShopStateSchema,
  type Locale,
  type PrepStatus,
  type JourneyAnswerResult,
  type JourneyQuestion,
  type JourneyRun,
  type JourneyState,
  type PowerUpResult,
  type ShopState,
  QuestionForPlayerSchema,
  RankingResponseSchema,
  SpinResponseSchema,
  type AnswerResult,
  type AuthTokens,
  type CategoryId,
  type GameMode,
  type GameState,
  type GameSummary,
  type MeResponse,
  type PublicUser,
  type QuestionForPlayer,
  type RankingPeriod,
  type SpinRequest,
  type SpinResponse,
} from '@trivia/shared';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly issues: { path: string; message: string }[] = [],
    /** Segundos até poder tentar de novo (respostas 429). */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Endereço deste mesmo aparelho (localhost, 127.x, ::1). O tráfego não sai do aparelho,
 * então http ali não expõe nada; é a mesma exceção que o iOS abre no App Transport Security.
 */
export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '::1' || /^127\.\d+\.\d+\.\d+$/.test(host);
  } catch {
    return false;
  }
}

/** O endereço da API não usa https num build de produção. */
export function insecureUrlError(baseUrl: string): ApiError {
  return new ApiError(
    `O app está configurado com um endereço sem https (${baseUrl}). Em produção, defina EXPO_PUBLIC_API_URL com https://.`,
    0,
    'INSECURE_API_URL',
  );
}

export interface TokenStore {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string | null): Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokenStore: TokenStore;
  fetch?: typeof fetch;
  /** Chamado quando a sessão começa, é renovada ou termina (user = null). */
  onSession?: (user: PublicUser | null) => void;
  /** Recusa endereço http:// (builds de produção). */
  requireHttps?: boolean;
  /** Idioma do jogador, mandado em Accept-Language: a API escreve os erros nele. */
  locale?: () => Locale;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions<T> {
  body?: unknown;
  schema?: z.ZodType<T>;
  auth?: boolean;
}

const ReportResultSchema = z.object({ received: z.boolean(), retired: z.boolean() });
const RankingSchema = RankingResponseSchema;

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;
  let accessToken: string | null = null;
  let refreshing: Promise<boolean> | null = null;
  const insecure = options.requireHttps === true && !/^https:\/\//i.test(baseUrl) && !isLoopbackUrl(baseUrl);

  async function raw(method: Method, path: string, body: unknown, token: string | null): Promise<Response> {
    if (insecure) throw insecureUrlError(baseUrl);
    try {
      return await doFetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(options.locale ? { 'Accept-Language': options.locale() } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ApiError(
        `Não foi possível falar com o servidor em ${baseUrl}. Confira se a API está rodando e se o aparelho está na mesma rede.`,
        0,
        'NETWORK',
      );
    }
  }

  async function parse<T>(res: Response, schema?: z.ZodType<T>): Promise<T> {
    const text = await res.text();
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = undefined;
      }
    }
    if (!res.ok) {
      const d = (data ?? {}) as { code?: unknown; message?: unknown; issues?: unknown };
      const message = typeof d.message === 'string' ? d.message : `O servidor respondeu com erro ${res.status}.`;
      const code = typeof d.code === 'string' ? d.code : res.status === 401 ? 'UNAUTHORIZED' : `HTTP_${res.status}`;
      const issues = Array.isArray(d.issues) ? (d.issues as { path: string; message: string }[]) : [];
      const retryAfter = Number(res.headers.get('retry-after'));
      throw new ApiError(message, res.status, code, issues, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null);
    }
    if (!schema) return undefined as T;
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new ApiError('A resposta do servidor veio num formato inesperado. Atualize o app e a API.', res.status, 'BAD_RESPONSE');
    }
    return parsed.data;
  }

  async function adopt(tokens: AuthTokens): Promise<PublicUser> {
    accessToken = tokens.accessToken;
    await options.tokenStore.setRefreshToken(tokens.refreshToken);
    options.onSession?.(tokens.user);
    return tokens.user;
  }

  async function clearSession(): Promise<void> {
    accessToken = null;
    await options.tokenStore.setRefreshToken(null);
    options.onSession?.(null);
  }

  /**
   * Renova a sessão com o refresh token guardado. Devolve false se não houver sessão
   * válida (a API respondeu 401). Outros erros (rede, 429, 5xx) sobem sem apagar nada.
   */
  function refresh(): Promise<boolean> {
    if (!refreshing) {
      refreshing = (async () => {
        const token = await options.tokenStore.getRefreshToken();
        if (!token) return false;
        try {
          const res = await raw('POST', '/auth/refresh', { refreshToken: token }, null);
          await adopt(await parse(res, AuthTokensSchema));
          return true;
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            await clearSession();
            return false;
          }
          throw error;
        }
      })().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  async function request<T>(method: Method, path: string, opts: RequestOptions<T> = {}): Promise<T> {
    const auth = opts.auth ?? true;
    if (auth && !accessToken) {
      if (!(await refresh())) throw new ApiError('Sua sessão terminou. Entre novamente.', 401, 'UNAUTHORIZED');
    }
    const sentToken = auth ? accessToken : null;
    let res = await raw(method, path, opts.body, sentToken);
    if (res.status === 401 && auth) {
      // Outra requisição pode ter renovado enquanto esta estava no ar.
      const renewed = (accessToken !== null && accessToken !== sentToken) || (await refresh());
      if (!renewed) throw new ApiError('Sua sessão terminou. Entre novamente.', 401, 'UNAUTHORIZED');
      res = await raw(method, path, opts.body, accessToken);
    }
    return parse(res, opts.schema);
  }

  return {
    baseUrl,

    /** Retoma a sessão salva no aparelho. */
    async restore(): Promise<boolean> {
      return refresh();
    },

    /** Há uma sessão guardada no aparelho (mesmo que ainda não validada)? */
    async hasStoredSession(): Promise<boolean> {
      return !!(await options.tokenStore.getRefreshToken());
    },

    auth: {
      async guest(displayName?: string, locale?: Locale): Promise<PublicUser> {
        const res = await raw('POST', '/auth/guest', { ...(displayName ? { displayName } : {}), ...(locale ? { locale } : {}) }, null);
        return adopt(await parse(res, AuthTokensSchema));
      },
      async login(email: string, password: string): Promise<PublicUser> {
        const res = await raw('POST', '/auth/login', { email, password }, null);
        return adopt(await parse(res, AuthTokensSchema));
      },
      /** Com sessão de convidado ativa, a API promove a conta do convidado. */
      async register(input: { email: string; password: string; displayName: string; locale?: Locale }): Promise<PublicUser> {
        const res = await raw('POST', '/auth/register', input, accessToken);
        return adopt(await parse(res, AuthTokensSchema));
      },
      /**
       * Login com Google, Apple ou Facebook (Fase 10). Com sessão aberta (convidado ou
       * conta), o login é ligado à conta atual, que mantém o progresso.
       */
      async social(input: SocialLoginRequest): Promise<PublicUser> {
        // Com sessão, o token precisa estar válido (renovado se for o caso): senão o servidor
        // não vê a sessão e criaria outra conta em vez de ligar o login à do jogador.
        if (accessToken || (await options.tokenStore.getRefreshToken())) {
          return adopt(await request('POST', '/auth/social', { body: input, schema: AuthTokensSchema }));
        }
        const res = await raw('POST', '/auth/social', input, null);
        return adopt(await parse(res, AuthTokensSchema));
      },
      /** Logins sociais que este servidor aceita. */
      providers: (): Promise<AuthProviders> => request('GET', '/auth/providers', { schema: AuthProvidersSchema, auth: false }),
      async logout(): Promise<void> {
        const token = await options.tokenStore.getRefreshToken();
        if (token) await raw('POST', '/auth/logout', { refreshToken: token }, null).catch(() => undefined);
        await clearSession();
      },
      /** Encerra a sessão em todos os aparelhos, inclusive neste. */
      async logoutAll(): Promise<void> {
        await request('POST', '/auth/logout-all');
        await clearSession();
      },
    },

    me: {
      get: (): Promise<MeResponse> => request('GET', '/me', { schema: MeResponseSchema }),
      rename: (displayName: string): Promise<MeResponse> =>
        request('PATCH', '/me', { body: { displayName }, schema: MeResponseSchema }),
      /** Idioma da interface e do conteúdo das fases e partidas. */
      setLocale: (locale: Locale): Promise<MeResponse> => request('PATCH', '/me', { body: { locale }, schema: MeResponseSchema }),
      /** Troca a senha; as outras sessões caem e este aparelho recebe tokens novos. */
      async changePassword(currentPassword: string, newPassword: string): Promise<PublicUser> {
        return adopt(await request('POST', '/me/password', { body: { currentPassword, newPassword }, schema: AuthTokensSchema }));
      },
      /** Desliga um login social (precisa sobrar outro jeito de entrar). */
      unlink: (provider: SocialProvider): Promise<MeResponse> => request('DELETE', `/me/identities/${provider}`, { schema: MeResponseSchema }),
      /** Exclui a conta (cadastrada: com a senha) e encerra a sessão local. */
      async deleteAccount(password?: string): Promise<void> {
        await request('POST', '/me/delete', { body: { confirm: true, ...(password ? { password } : {}) } });
        await clearSession();
      },
    },

    games: {
      list: (): Promise<GameSummary[]> => request('GET', '/games', { schema: z.array(GameSummarySchema) }),
      create: (mode: GameMode, inviteCode?: string): Promise<GameState> =>
        request('POST', '/games', { body: { mode, ...(inviteCode ? { inviteCode } : {}) }, schema: GameStateSchema }),
      state: (id: string): Promise<GameState> => request('GET', `/games/${id}`, { schema: GameStateSchema }),
      spin: (id: string, body: SpinRequest = {}): Promise<SpinResponse> => request('POST', `/games/${id}/spin`, { body, schema: SpinResponseSchema }),
      question: (id: string, spinId: string): Promise<QuestionForPlayer> =>
        request('POST', `/games/${id}/question`, { body: { spinId }, schema: QuestionForPlayerSchema }),
      currentQuestion: (id: string): Promise<QuestionForPlayer> =>
        request('GET', `/games/${id}/question`, { schema: QuestionForPlayerSchema }),
      crown: (id: string, category: CategoryId): Promise<QuestionForPlayer> =>
        request('POST', `/games/${id}/crown`, { body: { category }, schema: QuestionForPlayerSchema }),
      answer: (id: string, playId: string, optionIndex: number | null): Promise<AnswerResult> =>
        request('POST', `/games/${id}/answer`, { body: { playId, optionIndex }, schema: AnswerResultSchema }),
      forfeit: (id: string): Promise<GameState> => request('POST', `/games/${id}/forfeit`, { schema: GameStateSchema }),
      /** Prepara perguntas no idioma do jogador antes de abrir a roleta. */
      prepare: (): Promise<PrepStatus> => request('POST', '/games/prepare', { schema: PrepStatusSchema }),
    },

    /** Golem World: o mapa, as fases (corridas) e o armário do Golem. */
    journey: {
      state: (): Promise<JourneyState> => request('GET', '/journey', { schema: JourneyStateSchema }),
      /** Prepara a fase no idioma do jogador (tradução feita uma vez, no servidor). */
      prepare: (nodeId: string): Promise<PrepStatus> => request('POST', '/journey/prepare', { body: { nodeId }, schema: PrepStatusSchema }),
      start: (nodeId: string): Promise<JourneyRun> => request('POST', '/journey/runs', { body: { nodeId }, schema: JourneyRunSchema }),
      run: (runId: string): Promise<JourneyRun> => request('GET', `/journey/runs/${runId}`, { schema: JourneyRunSchema }),
      question: (runId: string): Promise<JourneyQuestion> =>
        request('POST', `/journey/runs/${runId}/question`, { schema: JourneyQuestionSchema }),
      answer: (runId: string, answerId: string, optionIndex: number | null): Promise<JourneyAnswerResult> =>
        request('POST', `/journey/runs/${runId}/answer`, { body: { answerId, optionIndex }, schema: JourneyAnswerResultSchema }),
      power: (runId: string, answerId: string, kind: JourneyPower): Promise<PowerUpResult> =>
        request('POST', `/journey/runs/${runId}/power`, { body: { answerId, kind }, schema: PowerUpResultSchema }),
      abandon: (runId: string): Promise<JourneyRun> => request('POST', `/journey/runs/${runId}/abandon`, { schema: JourneyRunSchema }),
      shop: (): Promise<ShopState> => request('GET', '/journey/shop', { schema: ShopStateSchema }),
      buy: (itemId: string): Promise<ShopState> => request('POST', '/journey/shop/buy', { body: { itemId }, schema: ShopStateSchema }),
      equip: (itemId: string, equipped: boolean): Promise<ShopState> =>
        request('POST', '/journey/shop/equip', { body: { itemId, equipped }, schema: ShopStateSchema }),
    },

    /** Fase 11: "Pedras do Choshen". O tabuleiro sai da semente; no fim vão todas as jogadas. */
    puzzle: {
      overview: (): Promise<PuzzleOverview> => request('GET', '/puzzle', { schema: PuzzleOverviewSchema }),
      start: (level: number): Promise<PuzzleRun> => request('POST', '/puzzle/runs', { body: { level }, schema: PuzzleRunSchema }),
      finish: (runId: string, moves: readonly PuzzleMove[]): Promise<PuzzleFinishResult> =>
        request('POST', `/puzzle/runs/${runId}/finish`, { body: { moves }, schema: PuzzleFinishResultSchema }),
    },

    /** Fase 9: carteira, lojas, anúncios com prêmio e pausas. */
    economy: {
      state: (): Promise<EconomyState> => request('GET', '/economy', { schema: EconomyStateSchema }),
      buyOffer: (offerId: string): Promise<EconomyState> => request('POST', '/economy/offers', { body: { offerId }, schema: EconomyStateSchema }),
      purchase: (input: PurchaseRequest): Promise<PurchaseResult> => request('POST', '/store/purchases', { body: input, schema: PurchaseResultSchema }),
      offer: (placement: AdPlacement, ref?: string): Promise<RewardTicket> =>
        request('POST', '/rewards/offers', { body: ref ? { placement, ref } : { placement }, schema: RewardTicketSchema }),
      watched: (ticketId: string): Promise<RewardTicket> => request('POST', `/rewards/${ticketId}/watched`, { schema: RewardTicketSchema }),
      claim: (ticketId: string): Promise<RewardClaimResult> => request('POST', `/rewards/${ticketId}/claim`, { schema: RewardClaimResultSchema }),
      adBreak: (kind: 'match' | 'level'): Promise<AdBreakResult> => request('POST', '/ads/break', { body: { kind }, schema: AdBreakResultSchema }),
    },

    ranking: (period: RankingPeriod) => request('GET', `/ranking?period=${period}`, { schema: RankingSchema }),

    reportQuestion: (input: { playId: string; reason: string; comment?: string }) =>
      request('POST', '/questions/report', { body: input, schema: ReportResultSchema }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
