/**
 * Contratos HTTP do Golem World. Mesma regra de ouro da roleta: a pergunta chega ao
 * app sem gabarito e sem a referência que entregaria a resposta.
 */
import { z } from 'zod';
import { DifficultySchema } from '../difficulty.js';
import { OPTION_COUNT, SourceLanguageSchema } from '../question.schema.js';
import { BoostCountsSchema, CurrencySchema } from '../economy/contracts.js';
import { ITEM_SLOTS } from './items.js';
import { JourneyTrackSchema } from './tracks.js';

const IsoDate = z.iso.datetime({ offset: true });

export const NodeStateSchema = z.enum(['locked', 'open', 'completed']);

export const JourneyNodeStatusSchema = z.object({
  nodeId: z.string(),
  state: NodeStateSchema,
  /** Melhor resultado (0 = nunca concluída). */
  stars: z.number().int().min(0).max(3),
  /** Há perguntas para esta fase (textos ingeridos ou perguntas aprovadas). */
  available: z.boolean(),
});
export type JourneyNodeStatus = z.infer<typeof JourneyNodeStatusSchema>;

export const ParashaStatusSchema = z.object({
  parashaId: z.string(),
  main: JourneyNodeStatusSchema,
  tracks: z.array(JourneyNodeStatusSchema.extend({ track: JourneyTrackSchema })),
});
export type ParashaStatus = z.infer<typeof ParashaStatusSchema>;

export const WorldStatusSchema = z.object({
  book: z.string(),
  unlocked: z.boolean(),
  parashot: z.array(ParashaStatusSchema),
  beitMidrash: JourneyNodeStatusSchema,
});
export type WorldStatus = z.infer<typeof WorldStatusSchema>;

export const GolemLookSchema = z.object({
  /** Itens vestidos, por espaço. */
  equipped: z.partialRecord(z.enum(ITEM_SLOTS), z.string()),
});
export type GolemLook = z.infer<typeof GolemLookSchema>;

export const JourneyStateSchema = z.object({
  coins: z.number().int().min(0),
  /** Habilidade de 0 a 3 e o nível que ela representa agora. */
  skill: z.number(),
  level: DifficultySchema,
  golem: GolemLookSchema,
  currentNodeId: z.string(),
  worlds: z.array(WorldStatusSchema),
  /** Corrida em andamento, se o jogador saiu no meio de uma fase. */
  activeRunId: z.uuid().nullable(),
});
export type JourneyState = z.infer<typeof JourneyStateSchema>;

export const StartRunRequestSchema = z.object({ nodeId: z.string().min(3).max(60) });

export const PowerUpCountsSchema = z.object({
  eliminate: z.number().int().min(0),
  skip: z.number().int().min(0),
  hint: z.number().int().min(0),
});

/**
 * Poderes numa pergunta: os três dos itens vestidos (com a cota da fase) e, quando a
 * cota acaba, as ajudas da mochila (Fase 9). "time" só existe na mochila.
 */
export const JOURNEY_POWERS = ['eliminate', 'skip', 'hint', 'time'] as const;
export type JourneyPower = (typeof JOURNEY_POWERS)[number];
export const JourneyPowerSchema = z.enum(JOURNEY_POWERS);

export const RunStatusSchema = z.enum(['active', 'completed', 'failed', 'abandoned']);

export const JourneyRunSchema = z.object({
  runId: z.uuid(),
  nodeId: z.string(),
  status: RunStatusSchema,
  hearts: z.number().int().min(0),
  maxHearts: z.number().int().min(1),
  obstacleIndex: z.number().int().min(0),
  obstacleCount: z.number().int().min(1),
  coins: z.number().int().min(0),
  powerUps: PowerUpCountsSchema,
  /** Ajudas da mochila (compradas ou ganhas em anúncios), usadas quando a cota da fase acaba. */
  boosts: BoostCountsSchema,
  /** Já voltou uma vez com 1 coração (anúncio): não dá para repetir nesta fase. */
  revived: z.boolean(),
  firstMistakeFree: z.boolean(),
  timeLimitSeconds: z.number().int().positive(),
  level: DifficultySchema,
  /** Pergunta aberta (se o app recarregar no meio). */
  openAnswerId: z.uuid().nullable(),
});
export type JourneyRun = z.infer<typeof JourneyRunSchema>;

export const JourneyQuestionSchema = z.object({
  answerId: z.uuid(),
  obstacleIndex: z.number().int().min(0),
  track: JourneyTrackSchema,
  difficulty: DifficultySchema,
  text: z.string(),
  /** Trecho mostrado acima da pergunta (um comentário, uma mishná…), quando a pergunta é sobre ele. */
  context: z
    .object({ label: z.string(), text: z.string(), language: SourceLanguageSchema })
    .nullable(),
  options: z.array(z.string()).length(OPTION_COUNT),
  /** Direção do texto das alternativas (hebraico = rtl). */
  optionsDirection: z.enum(['ltr', 'rtl']),
  /** Posições já eliminadas por um item. */
  eliminated: z.array(z.number().int().min(0).max(OPTION_COUNT - 1)),
  servedAt: IsoDate,
  deadlineAt: IsoDate,
  serverNow: IsoDate,
  timeLimitSeconds: z.number().int().positive(),
  /** Já ganhou tempo extra nesta pergunta. */
  timeAdded: z.boolean(),
});
export type JourneyQuestion = z.infer<typeof JourneyQuestionSchema>;

export const JourneyAnswerRequestSchema = z.object({
  answerId: z.uuid(),
  optionIndex: z.number().int().min(0).max(OPTION_COUNT - 1).nullable(),
});

export const AnswerOutcomeSchema = z.enum(['perfect', 'pass', 'slow', 'wrong', 'timeout', 'skipped']);

export const JourneySourceSchema = z.object({
  ref: z.string(),
  url: z.url(),
  quote: z.string(),
  language: SourceLanguageSchema,
  versionTitle: z.string().nullable(),
  license: z.string().nullable(),
  /** A citação é tradução automática do original (Fase 8). */
  machineTranslated: z.boolean(),
});

export const JourneyCompletionSchema = z.object({
  stars: z.number().int().min(1).max(3),
  bestStars: z.number().int().min(1).max(3),
  firstTime: z.boolean(),
  bonusCoins: z.number().int().min(0),
  /** Nós que abriram agora no mapa (para a animação do caminho). */
  opened: z.array(z.string()),
  /** Itens ganhos como prêmio. */
  rewards: z.array(z.string()),
});

export const JourneyAnswerResultSchema = z.object({
  correct: z.boolean(),
  timedOut: z.boolean(),
  outcome: AnswerOutcomeSchema,
  /** Se o Golem passou do obstáculo (acerto ou pulo). */
  passed: z.boolean(),
  /** O erro foi perdoado pela pena do sofer. */
  forgiven: z.boolean(),
  correctOptionIndex: z.number().int().min(0).max(OPTION_COUNT - 1),
  explanation: z.string(),
  source: JourneySourceSchema,
  coinsAwarded: z.number().int().min(0),
  run: JourneyRunSchema,
  /** Nível da próxima pergunta. */
  nextLevel: DifficultySchema,
  completion: JourneyCompletionSchema.nullable(),
});
export type JourneyAnswerResult = z.infer<typeof JourneyAnswerResultSchema>;

export const PowerUpRequestSchema = z.object({ answerId: z.uuid(), kind: JourneyPowerSchema });

export const PowerUpResultSchema = z.object({
  kind: JourneyPowerSchema,
  /** De onde saiu o poder: da cota dos itens ou da mochila. */
  source: z.enum(['item', 'boost']),
  eliminated: z.array(z.number().int()).optional(),
  /** "time": o novo prazo da pergunta. */
  deadlineAt: IsoDate.optional(),
  hint: z.object({ ref: z.string(), url: z.url(), text: z.string() }).optional(),
  /** "skip" responde a pergunta na hora: o resultado vem aqui. */
  answer: JourneyAnswerResultSchema.optional(),
  run: JourneyRunSchema,
});
export type PowerUpResult = z.infer<typeof PowerUpResultSchema>;

export const ShopItemSchema = z.object({
  id: z.string(),
  owned: z.boolean(),
  equipped: z.boolean(),
  /** Preço (só itens da loja), em moedas de sabedoria ou em shekels. */
  price: z.number().int().nullable(),
  currency: CurrencySchema.nullable(),
  /** Pode comprar agora (personagens da história pedem antes a parashá concluída). */
  purchasable: z.boolean(),
  /** Para o que ainda não dá para ter: como conseguir (no idioma do jogador). */
  howToEarn: z.string().nullable(),
});

export const ShopStateSchema = z.object({
  coins: z.number().int().min(0),
  shekels: z.number().int().min(0),
  items: z.array(ShopItemSchema),
  golem: GolemLookSchema,
});
export type ShopState = z.infer<typeof ShopStateSchema>;

export const BuyItemRequestSchema = z.object({ itemId: z.string().min(1).max(40) });
export const EquipItemRequestSchema = z.object({ itemId: z.string().min(1).max(40), equipped: z.boolean() });

// ---------------------------------------------------------------------------
// Preparo de uma fase ou partida no idioma do jogador (Fase 8)
// ---------------------------------------------------------------------------

export const PrepareNodeRequestSchema = z.object({ nodeId: z.string().min(3).max(60) });

/**
 * ready: pode jogar; preparing: o servidor está traduzindo (o app mostra a tela de
 * "como jogar" e pergunta de novo); unavailable: não há textos neste idioma e a
 * tradução automática está desligada.
 */
export const PrepStatusSchema = z.object({
  status: z.enum(['ready', 'preparing', 'unavailable']),
  done: z.number().int().min(0),
  total: z.number().int().min(0),
});
export type PrepStatus = z.infer<typeof PrepStatusSchema>;
