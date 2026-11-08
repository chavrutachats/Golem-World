/**
 * Contratos HTTP da economia (Fase 9): carteira, lojas, anúncios com prêmio e pausas.
 */
import { z } from 'zod';
import { LivesSchema } from '../lives.schema.js';
import { AD_PLACEMENTS, BOOSTS, CURRENCIES, type BoostKind, type Prize } from './rules.js';

const IsoDate = z.iso.datetime({ offset: true });

export const CurrencySchema = z.enum(CURRENCIES);
export const BoostKindSchema = z.enum(BOOSTS);
export const AdPlacementSchema = z.enum(AD_PLACEMENTS);

export const BoostCountsSchema = z.object({
  time: z.number().int().min(0),
  skip: z.number().int().min(0),
  eliminate: z.number().int().min(0),
}) satisfies z.ZodType<Record<BoostKind, number>>;
export type BoostCounts = z.infer<typeof BoostCountsSchema>;

export const PrizeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('coins'), amount: z.number().int().positive() }),
  z.object({ kind: z.literal('shekels'), amount: z.number().int().positive() }),
  z.object({ kind: z.literal('boost'), boost: BoostKindSchema, amount: z.number().int().positive() }),
  z.object({ kind: z.literal('life'), amount: z.number().int().positive() }),
  z.object({ kind: z.literal('heart') }),
  z.object({ kind: z.literal('moves'), amount: z.number().int().positive() }),
  z.object({ kind: z.literal('double'), amount: z.number().int().min(0) }),
]) satisfies z.ZodType<Prize>;

/**
 * Como os anúncios funcionam nesta instalação (definido no servidor):
 * - admob: anúncios reais; o prêmio só vale com a confirmação do Google (SSV);
 * - trust-client: anúncios de teste do AdMob, confiando no aviso do app (só fora de produção);
 * - demo: anúncio de demonstração desenhado pelo próprio jogo (web, Expo Go, testes);
 * - off: sem anúncios.
 */
export const ADS_MODES = ['admob', 'trust-client', 'demo', 'off'] as const;
export type AdsMode = (typeof ADS_MODES)[number];

/** live: App Store e Google Play de verdade; demo: compra simulada (só fora de produção); off: loja fechada. */
export const STORE_MODES = ['live', 'demo', 'off'] as const;
export type StoreMode = (typeof STORE_MODES)[number];

export const STORES = ['apple', 'google', 'demo'] as const;
export type StoreName = (typeof STORES)[number];

export const WalletSchema = z.object({
  coins: z.number().int().min(0),
  shekels: z.number().int().min(0),
});
export type Wallet = z.infer<typeof WalletSchema>;

export const EconomyStateSchema = z.object({
  wallet: WalletSchema,
  /** Comprou "Sem anúncios": nada de anúncio obrigatório (os com prêmio continuam). */
  adFree: z.boolean(),
  boosts: BoostCountsSchema,
  lives: LivesSchema,
  ads: z.object({ mode: z.enum(ADS_MODES) }),
  store: z.object({ mode: z.enum(STORE_MODES) }),
  /** Anúncios com prêmio já vistos hoje, por lugar, e o teto do dia. */
  rewardsToday: z.record(AdPlacementSchema, z.object({ used: z.number().int().min(0), cap: z.number().int().min(0) })),
});
export type EconomyState = z.infer<typeof EconomyStateSchema>;

export const BuyOfferRequestSchema = z.object({ offerId: z.string().min(1).max(40) });

// ---------------------------------------------------------------------------
// Compras nas lojas
// ---------------------------------------------------------------------------

export const PurchaseRequestSchema = z.object({
  store: z.enum(STORES),
  productId: z.string().min(1).max(60),
  /**
   * apple: a transação assinada (JWS) que o StoreKit 2 entrega;
   * google: o purchaseToken; demo: qualquer texto (só fora de produção).
   */
  receipt: z.string().min(1).max(20_000),
});
export type PurchaseRequest = z.infer<typeof PurchaseRequestSchema>;

export const PurchaseResultSchema = z.object({
  productId: z.string(),
  /** A mesma compra já tinha sido entregue (restauração ou reenvio): nada foi dado em dobro. */
  alreadyGranted: z.boolean(),
  granted: z.object({ shekels: z.number().int().min(0), adFree: z.boolean() }),
  economy: EconomyStateSchema,
});
export type PurchaseResult = z.infer<typeof PurchaseResultSchema>;

// ---------------------------------------------------------------------------
// Anúncios com prêmio
// ---------------------------------------------------------------------------

export const RewardOfferRequestSchema = z.object({
  placement: AdPlacementSchema,
  /** Do que é o prêmio: a fase (continue, double), a rodada da roleta (wheel) ou a partida do puzzle (moves). */
  ref: z.uuid().optional(),
});
export type RewardOfferRequest = z.infer<typeof RewardOfferRequestSchema>;

export const RewardTicketSchema = z.object({
  id: z.uuid(),
  placement: AdPlacementSchema,
  prize: PrizeSchema,
  status: z.enum(['offered', 'watched', 'claimed', 'expired']),
  expiresAt: IsoDate,
  /**
   * Vai junto do anúncio para a confirmação do Google (SSV, campo custom_data): é por
   * ele que o servidor sabe qual prêmio liberar.
   */
  ssvCustomData: z.string(),
});
export type RewardTicket = z.infer<typeof RewardTicketSchema>;

export const RewardClaimResultSchema = z.object({
  /** pending: o Google ainda não confirmou o anúncio; o app pergunta de novo em instantes. */
  status: z.enum(['claimed', 'pending']),
  ticket: RewardTicketSchema,
  economy: EconomyStateSchema,
});
export type RewardClaimResult = z.infer<typeof RewardClaimResultSchema>;

// ---------------------------------------------------------------------------
// Pausas (anúncio obrigatório)
// ---------------------------------------------------------------------------

export const AdBreakRequestSchema = z.object({ kind: z.enum(['match', 'level']) });

export const AdBreakResultSchema = z.object({
  /** ad: hora do anúncio. O app oferece antes o presente (gift); se o jogador recusar, mostra o anúncio comum. */
  action: z.enum(['none', 'ad']),
  gift: RewardTicketSchema.nullable(),
});
export type AdBreakResult = z.infer<typeof AdBreakResultSchema>;

/** Prêmio da rodada, mostrado ao lado da roleta na sua vez. */
export const RoundPrizeSchema = z.object({
  /** A rodada (turno) a que o prêmio pertence: vai como `ref` ao pedir a oferta. */
  ref: z.uuid(),
  prize: PrizeSchema,
  claimed: z.boolean(),
});
export type RoundPrize = z.infer<typeof RoundPrizeSchema>;
