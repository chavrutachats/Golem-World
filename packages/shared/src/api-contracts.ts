/**
 * Contratos HTTP entre a API e o app. A API valida as entradas com estes schemas
 * e o app tipa as respostas com eles, então uma mudança aqui quebra a compilação
 * dos dois lados em vez de quebrar em produção.
 *
 * Regra de ouro: nada que chega ao app antes da resposta contém o gabarito
 * (nem índice correto, nem referência da fonte, que poderia entregar a resposta).
 */
import { z } from 'zod';
import { CategoryIdSchema, WheelSliceSchema } from './categories.js';
import { DifficultySchema } from './difficulty.js';
import { GameModeSchema, GameStatusSchema } from './game-rules.js';
import { OPTION_COUNT, SourceLanguageSchema } from './question.schema.js';
import { displayNameProblem } from './moderation.js';
import { NewPasswordSchema } from './password.js';
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from './limits.js';
import { LocaleSchema } from './i18n.js';
import { GolemLookSchema } from './journey/contracts.js';
import { LivesSchema } from './lives.schema.js';
import { RoundPrizeSchema } from './economy/contracts.js';

const IsoDate = z.iso.datetime({ offset: true });

export { LivesSchema, type Lives } from './lives.schema.js';

// ---------------------------------------------------------------------------
// Usuários e autenticação
// ---------------------------------------------------------------------------

/**
 * Letras latinas (com acentos), letras e sinais hebraicos, algarismos, espaço, ponto,
 * hífen e sublinhado. Outros alfabetos ficam de fora de propósito: letras cirílicas ou
 * gregas iguais às latinas ("Аdmin" com A cirílico) burlariam a moderação.
 */
const DISPLAY_NAME_CHARS = /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u017F\u0591-\u05C7\u05D0-\u05EA\u05EF-\u05F40-9 ._-]+$/u;

export const DisplayNameSchema = z
  .string()
  .trim()
  .normalize('NFC')
  .min(DISPLAY_NAME_MIN, `Use pelo menos ${DISPLAY_NAME_MIN} caracteres.`)
  .max(DISPLAY_NAME_MAX, `Use no máximo ${DISPLAY_NAME_MAX} caracteres.`)
  .regex(DISPLAY_NAME_CHARS, 'Use letras (do alfabeto latino ou hebraico), números, espaço, ponto, hífen ou sublinhado.')
  .superRefine((name, ctx) => {
    const problem = displayNameProblem(name);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

export const PublicUserSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  isGuest: z.boolean(),
  totalPoints: z.number().int(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const GuestLoginRequestSchema = z.object({
  displayName: DisplayNameSchema.optional(),
  /** Idioma do aparelho, para a conta já nascer nele. */
  locale: LocaleSchema.optional(),
});

export const RegisterRequestSchema = z.object({
  email: z.email().max(254),
  password: NewPasswordSchema,
  displayName: DisplayNameSchema,
  locale: LocaleSchema.optional(),
});

// ---------------------------------------------------------------------------
// Login social (Fase 10)
// ---------------------------------------------------------------------------

/**
 * Google e Apple entregam um ID token (JWT assinado); o Facebook, um access token.
 * O Instagram não tem mais login para apps de consumidor (a Meta encerrou a API em 2024).
 */
export const SOCIAL_PROVIDERS = ['google', 'apple', 'facebook'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
export const SocialProviderSchema = z.enum(SOCIAL_PROVIDERS);

export const SocialLoginRequestSchema = z.object({
  provider: SocialProviderSchema,
  token: z.string().min(20).max(8000),
  /**
   * O nonce original. O app manda ao provedor só o SHA-256 dele, e o provedor o grava
   * no token: quem interceptar o token não tem o nonce original para reaproveitá-lo.
   */
  nonce: z.string().min(16).max(128).optional(),
  /** Nome para a conta nova (a Apple só manda o nome na primeira vez). */
  displayName: z.string().trim().max(80).optional(),
  locale: LocaleSchema.optional(),
});
export type SocialLoginRequest = z.infer<typeof SocialLoginRequestSchema>;

/** Que logins este servidor aceita (o app só mostra os botões que funcionam). */
export const AuthProvidersSchema = z.object({
  google: z.boolean(),
  apple: z.boolean(),
  facebook: z.boolean(),
});
export type AuthProviders = z.infer<typeof AuthProvidersSchema>;

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: NewPasswordSchema,
});

/** Contas cadastradas confirmam com a senha; convidados só com `confirm`. */
export const DeleteAccountRequestSchema = z.object({
  confirm: z.literal(true),
  password: z.string().min(1).max(128).optional(),
});

export const MeResponseSchema = PublicUserSchema.extend({
  email: z.string().nullable(),
  /** Tem senha (pode entrar com e-mail e senha). */
  hasPassword: z.boolean(),
  /** Contas de outros serviços ligadas a esta (Fase 10). */
  identities: z.array(SocialProviderSchema),
  /** Idioma escolhido (interface e conteúdo). */
  locale: LocaleSchema,
  lives: LivesSchema,
  /** Moedas do Golem World (só compram itens; não contam para o ranking). */
  coins: z.number().int().min(0),
  golem: GolemLookSchema,
  stats: z.object({
    gamesPlayed: z.number().int().min(0),
    wins: z.number().int().min(0),
    answered: z.number().int().min(0),
    correct: z.number().int().min(0),
  }),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const UpdateMeRequestSchema = z
  .object({
    displayName: DisplayNameSchema.optional(),
    locale: LocaleSchema.optional(),
  })
  .refine((v) => v.displayName !== undefined || v.locale !== undefined, { message: 'Nada para atualizar.' });

export const LoginRequestSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: PublicUserSchema,
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------

export const CreateGameRequestSchema = z.object({
  mode: GameModeSchema,
  /** Só no modo "friend": código do convite para entrar numa partida existente. */
  inviteCode: z.string().trim().toUpperCase().length(6).optional(),
});

export const PlayerStateSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  /** Adversário controlado pelo servidor (modo aleatório sem ninguém na fila). */
  isBot: z.boolean(),
  golem: GolemLookSchema,
  seals: z.array(CategoryIdSchema),
  crownProgress: z.number().int().min(0),
  score: z.number().int(),
  correctCount: z.number().int().min(0),
  wrongCount: z.number().int().min(0),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;

/**
 * O que a partida espera agora, do ponto de vista de quem consulta:
 * - waiting_opponent: aguardando alguém entrar (aleatório ou convite);
 * - spin: é a sua vez e você deve girar o sevivon (também depois de cair no Prêmio);
 * - spun: você girou e caiu numa categoria; peça a pergunta (pendingSpin);
 * - question: há uma pergunta aberta para você responder (pendingPlayId);
 * - choose_crown: a Coroa está cheia; escolha a categoria do selo a disputar;
 * - opponent_turn: vez do adversário;
 * - finished: partida encerrada.
 */
export const GAME_PHASES = ['waiting_opponent', 'spin', 'spun', 'question', 'choose_crown', 'opponent_turn', 'finished'] as const;
export type GamePhase = (typeof GAME_PHASES)[number];
export const GamePhaseSchema = z.enum(GAME_PHASES);

/** Pedido de giro. `withPrize`: o app consegue mostrar anúncio com prêmio agora (só então a face do Prêmio entra no sorteio). */
export const SpinRequestSchema = z.object({ withPrize: z.boolean().default(false) }).strict();
export type SpinRequest = z.input<typeof SpinRequestSchema>;

export const SpinResponseSchema = z.object({
  spinId: z.uuid(),
  result: WheelSliceSchema,
  /** Índice da face em WHEEL_SLICES: o app anima o sevivon até cair exatamente com ela para cima. */
  sliceIndex: z.number().int().min(0),
  /** Só quando caiu no Prêmio: o prêmio da rodada (assistir é opcional; depois, gira-se de novo). */
  prize: RoundPrizeSchema.nullable().default(null),
});
export type SpinResponse = z.infer<typeof SpinResponseSchema>;

export const GameStateSchema = z.object({
  id: z.uuid(),
  mode: GameModeSchema,
  status: GameStatusSchema,
  phase: GamePhaseSchema,
  roundNumber: z.number().int().min(1),
  maxRounds: z.number().int().min(1),
  isMyTurn: z.boolean(),
  inviteCode: z.string().nullable(),
  me: PlayerStateSchema,
  opponent: PlayerStateSchema.nullable(),
  /** Giro feito e ainda não usado (fase "spun"). */
  pendingSpin: SpinResponseSchema.nullable(),
  /** Pergunta aberta (fase "question"); recupere-a em GET /games/:id/question. */
  pendingPlayId: z.uuid().nullable(),
  /** Na fase "choose_crown": categorias que o jogador pode disputar (sem selo e com perguntas). */
  crownChoices: z.array(CategoryIdSchema),
  /** Prazo para quem está com a vez agir antes de perder por W.O. */
  turnDeadlineAt: IsoDate.nullable(),
  winnerUserId: z.uuid().nullable(),
  /** Suas vidas agora (sem vidas, não dá para girar até voltar uma). */
  lives: LivesSchema,
  /**
   * Prêmio da rodada, quando o último giro desta vez caiu na face do Prêmio e ele ainda não
   * foi resgatado (resgatável assistindo a um anúncio). Some quando o jogador gira de novo.
   */
  roundPrize: RoundPrizeSchema.nullable(),
  updatedAt: IsoDate,
});
export type GameState = z.infer<typeof GameStateSchema>;

export const GameSummarySchema = z.object({
  id: z.uuid(),
  mode: GameModeSchema,
  status: GameStatusSchema,
  phase: GamePhaseSchema,
  isMyTurn: z.boolean(),
  opponentName: z.string().nullable(),
  opponentIsBot: z.boolean(),
  mySeals: z.number().int().min(0),
  opponentSeals: z.number().int().min(0),
  winnerUserId: z.uuid().nullable(),
  updatedAt: IsoDate,
});
export type GameSummary = z.infer<typeof GameSummarySchema>;

// ---------------------------------------------------------------------------
// Roleta, pergunta e resposta
// ---------------------------------------------------------------------------

export const RequestQuestionSchema = z.object({
  spinId: z.uuid(),
});

/** Coroa cheia (3 acertos seguidos ou giro na fatia Coroa): escolha o selo a disputar. */
export const CrownChoiceRequestSchema = z.object({
  category: CategoryIdSchema,
});

export const QuestionForPlayerSchema = z.object({
  playId: z.uuid(),
  category: CategoryIdSchema,
  difficulty: DifficultySchema,
  isCrownChallenge: z.boolean(),
  text: z.string(),
  /** Trecho mostrado acima da pergunta (perguntas montadas a partir de um versículo ou comentário). */
  context: z.object({ label: z.string(), text: z.string(), language: SourceLanguageSchema }).nullable(),
  /** Alternativas já embaralhadas para este jogador; o índice é a posição na tela. */
  options: z.array(z.string()).length(OPTION_COUNT),
  optionsDirection: z.enum(['ltr', 'rtl']),
  servedAt: IsoDate,
  deadlineAt: IsoDate,
  /** Hora do servidor no envio: o app calcula o tempo restante sem depender do relógio do celular. */
  serverNow: IsoDate,
  timeLimitSeconds: z.number().int().positive(),
});
export type QuestionForPlayer = z.infer<typeof QuestionForPlayerSchema>;

export const AnswerRequestSchema = z.object({
  playId: z.uuid(),
  /** Posição escolhida na tela (0-3), ou null quando o tempo acabou. */
  optionIndex: z.number().int().min(0).max(OPTION_COUNT - 1).nullable(),
});

export const QuestionSourceSchema = z.object({
  ref: z.string(),
  url: z.url(),
  evidenceQuote: z.string(),
  evidenceLanguage: SourceLanguageSchema,
  versionTitle: z.string().nullable(),
  license: z.string().nullable(),
  /** A citação é tradução automática do original (Fase 8). */
  machineTranslated: z.boolean(),
});
export type QuestionSource = z.infer<typeof QuestionSourceSchema>;

export const AnswerResultSchema = z.object({
  correct: z.boolean(),
  timedOut: z.boolean(),
  /** Posição correta NA ORDEM em que o jogador viu as alternativas. */
  correctOptionIndex: z.number().int().min(0).max(OPTION_COUNT - 1),
  pointsAwarded: z.number().int().min(0),
  explanation: z.string(),
  source: QuestionSourceSchema,
  crownProgress: z.number().int().min(0),
  sealEarned: CategoryIdSchema.nullable(),
  /** true = o jogador gira de novo. */
  canSpinAgain: z.boolean(),
  /** true = a Coroa encheu: o próximo passo é escolher o selo (POST /games/:id/crown). */
  crownReady: z.boolean(),
  /** true = errou (ou o tempo acabou) e a vez passou. */
  turnPassed: z.boolean(),
  gameFinished: z.boolean(),
  winnerUserId: z.uuid().nullable(),
  /** Vidas depois desta resposta. */
  lives: LivesSchema,
});
export type AnswerResult = z.infer<typeof AnswerResultSchema>;

// ---------------------------------------------------------------------------
// Ranking e denúncias
// ---------------------------------------------------------------------------

export const RankingPeriodSchema = z.enum(['week', 'all']);
export type RankingPeriod = z.infer<typeof RankingPeriodSchema>;

export const RankingEntrySchema = z.object({
  position: z.number().int().min(1),
  userId: z.uuid(),
  displayName: z.string(),
  points: z.number().int(),
});
export type RankingEntry = z.infer<typeof RankingEntrySchema>;

export const RankingResponseSchema = z.object({
  period: RankingPeriodSchema,
  entries: z.array(RankingEntrySchema),
  me: RankingEntrySchema.nullable(),
});

export const REPORT_REASONS = ['incorrect', 'ambiguous', 'disrespectful', 'typo', 'other'] as const;
export const ReportQuestionRequestSchema = z.object({
  playId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  comment: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Revisão humana (admin)
// ---------------------------------------------------------------------------

export const ReviewDecisionRequestSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(1000).optional(),
  /** Correções feitas pelo revisor antes de aprovar. */
  edits: z
    .object({
      text: z.string().trim().min(10).max(220).optional(),
      options: z.array(z.string().trim().min(1).max(90)).length(OPTION_COUNT).optional(),
      correctIndex: z.number().int().min(0).max(OPTION_COUNT - 1).optional(),
      explanation: z.string().trim().min(10).max(400).optional(),
      difficulty: DifficultySchema.optional(),
    })
    .optional(),
});
