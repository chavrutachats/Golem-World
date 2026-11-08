/**
 * Economia do jogo (Fase 9): duas moedas, produtos das lojas, ajudas, anúncios com
 * prêmio e o ritmo dos anúncios obrigatórios. Regras puras, usadas igual pela API
 * (que decide) e pelo app (que mostra).
 *
 * - Moedas de sabedoria (`coins`): ganhas por mérito, estudando. Compram equipamentos
 *   (com vantagens só no Golem World) e os personagens da própria história.
 * - Shekels: comprados com dinheiro (ou ganhos aos poucos em anúncios com prêmio).
 *   Compram só o que não decide partida: material do Golem, personagens visitantes,
 *   vidas da roleta e ajudas do Golem World. A roleta continua em pé de igualdade.
 *
 * Nada aqui é sorteio pago: todo prêmio de anúncio aparece ANTES de o jogador decidir
 * assistir, e nenhum produto pago tem conteúdo surpresa (sem "caixas de recompensa").
 */
import { LIVES_RULES } from '../competitive.js';

export const CURRENCIES = ['coins', 'shekels'] as const;
export type Currency = (typeof CURRENCIES)[number];

// ---------------------------------------------------------------------------
// Produtos das lojas (App Store e Google Play)
// ---------------------------------------------------------------------------

export type StoreProductKind = 'shekels' | 'noAds';

export interface StoreProductDef {
  /** Mesmo id cadastrado na App Store Connect e no Google Play Console. */
  id: string;
  kind: StoreProductKind;
  /** Shekels entregues (pacotes). */
  amount: number;
  /** Consumível (pode comprar de novo) ou permanente (restaurável). */
  consumable: boolean;
  /** Bônus em relação ao pacote menor, só para mostrar. */
  bonusPct: number;
}

export const STORE_PRODUCTS: readonly StoreProductDef[] = [
  { id: 'shekels_120', kind: 'shekels', amount: 120, consumable: true, bonusPct: 0 },
  { id: 'shekels_650', kind: 'shekels', amount: 650, consumable: true, bonusPct: 8 },
  { id: 'shekels_1400', kind: 'shekels', amount: 1400, consumable: true, bonusPct: 17 },
  { id: 'no_ads', kind: 'noAds', amount: 0, consumable: false, bonusPct: 0 },
];

export const NO_ADS_PRODUCT_ID = 'no_ads';

export function storeProduct(id: string): StoreProductDef | undefined {
  return STORE_PRODUCTS.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Ajudas do Golem World (consumíveis)
// ---------------------------------------------------------------------------

/**
 * Ajudas guardadas na mochila, para quando as dos itens da fase acabarem. Só valem no
 * Golem World (a roleta é competitiva e não tem ajuda nenhuma).
 */
export const BOOSTS = ['time', 'skip', 'eliminate'] as const;
export type BoostKind = (typeof BOOSTS)[number];

export const BOOST_RULES = {
  /** Segundos a mais na pergunta aberta (uma vez por pergunta). */
  timeSeconds: 10,
  /** Teto da mochila, por tipo. */
  maxPerKind: 99,
} as const;

// ---------------------------------------------------------------------------
// O que se compra com shekels (fora os itens do armário)
// ---------------------------------------------------------------------------

export type ShekelOffer =
  | { id: string; kind: 'lives'; price: number }
  | { id: string; kind: 'boost'; boost: BoostKind; amount: number; price: number };

export const SHEKEL_OFFERS: readonly ShekelOffer[] = [
  { id: 'lives-refill', kind: 'lives', price: 25 },
  { id: 'time-3', kind: 'boost', boost: 'time', amount: 3, price: 30 },
  { id: 'eliminate-3', kind: 'boost', boost: 'eliminate', amount: 3, price: 35 },
  { id: 'skip-3', kind: 'boost', boost: 'skip', amount: 3, price: 45 },
];

export function shekelOffer(id: string): ShekelOffer | undefined {
  return SHEKEL_OFFERS.find((o) => o.id === id);
}

/** Vidas da roleta depois de uma recarga (o máximo normal). */
export const LIVES_AFTER_REFILL = LIVES_RULES.max;

/** Preço da recarga de vidas (o mesmo da oferta "lives-refill"). */
export const LIVES_REFILL_PRICE = SHEKEL_OFFERS.find((o) => o.kind === 'lives')!.price;

// ---------------------------------------------------------------------------
// Anúncios com prêmio
// ---------------------------------------------------------------------------

/**
 * Onde um anúncio com prêmio pode aparecer, sempre por escolha do jogador:
 * - continue: perdeu o último coração numa fase → continua com 1 coração (1 vez por fase);
 * - double: terminou a fase → dobra as moedas que ganhou nela;
 * - wheel: o prêmio da rodada, ao lado da roleta (muda a cada vez);
 * - life: sem vidas na roleta → +1 vida;
 * - boost: +1 ajuda para o Golem World;
 * - gift: o presente da pausa (oferecido antes do anúncio obrigatório);
 * - moves: acabaram as jogadas no "Pedras do Choshen" → +5 jogadas (1 vez por partida).
 */
export const AD_PLACEMENTS = ['continue', 'double', 'wheel', 'life', 'boost', 'gift', 'moves'] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export type Prize =
  | { kind: 'coins'; amount: number }
  | { kind: 'shekels'; amount: number }
  | { kind: 'boost'; boost: BoostKind; amount: number }
  | { kind: 'life'; amount: number }
  | { kind: 'heart' }
  | { kind: 'moves'; amount: number }
  | { kind: 'double'; amount: number };

export interface WeightedPrize {
  prize: Prize;
  weight: number;
}

/** Prêmio da rodada da roleta: nada que mude a partida (só vale fora dela). */
export const WHEEL_PRIZES: readonly WeightedPrize[] = [
  { prize: { kind: 'coins', amount: 15 }, weight: 26 },
  { prize: { kind: 'coins', amount: 30 }, weight: 14 },
  { prize: { kind: 'life', amount: 1 }, weight: 16 },
  { prize: { kind: 'boost', boost: 'time', amount: 1 }, weight: 12 },
  { prize: { kind: 'boost', boost: 'eliminate', amount: 1 }, weight: 12 },
  { prize: { kind: 'boost', boost: 'skip', amount: 1 }, weight: 10 },
  { prize: { kind: 'shekels', amount: 5 }, weight: 10 },
];

/** Presente da pausa (antes do anúncio obrigatório). */
export const GIFT_PRIZES: readonly WeightedPrize[] = [
  { prize: { kind: 'coins', amount: 20 }, weight: 34 },
  { prize: { kind: 'life', amount: 1 }, weight: 22 },
  { prize: { kind: 'boost', boost: 'time', amount: 1 }, weight: 14 },
  { prize: { kind: 'boost', boost: 'eliminate', amount: 1 }, weight: 12 },
  { prize: { kind: 'shekels', amount: 3 }, weight: 18 },
];

/** "Ganhe uma ajuda": qual ajuda vem, sorteada antes (e mostrada). */
export const BOOST_AD_PRIZES: readonly WeightedPrize[] = BOOSTS.map((boost) => ({ prize: { kind: 'boost', boost, amount: 1 }, weight: 1 }));

/**
 * Escolhe um prêmio da tabela a partir de um número de 32 bits. A API usa um HMAC do
 * contexto (a rodada, a pausa), então o prêmio é fixo para aquele momento: recarregar
 * a tela não troca o prêmio.
 */
export function drawPrize(table: readonly WeightedPrize[], u32: number): Prize {
  const total = table.reduce((sum, p) => sum + p.weight, 0);
  if (total <= 0 || table.length === 0) throw new Error('Tabela de prêmios vazia.');
  let roll = (u32 >>> 0) % total;
  for (const entry of table) {
    if (roll < entry.weight) return entry.prize;
    roll -= entry.weight;
  }
  return table[table.length - 1]!.prize;
}

export const REWARD_RULES = {
  /** Quanto tempo uma oferta vale depois de criada. */
  offerTtlMinutes: 20,
  /** Prazo para continuar depois de perder o último coração, e para dobrar depois de concluir. */
  afterRunMinutes: 15,
  /** Prêmios por dia (por lugar), contando só os anúncios vistos. */
  dailyCap: { continue: 20, double: 20, wheel: 12, life: 5, boost: 3, gift: 10, moves: 15 } satisfies Record<AdPlacement, number>,
} as const;

// ---------------------------------------------------------------------------
// Anúncio obrigatório (intersticial) e o botão "Sem anúncios"
// ---------------------------------------------------------------------------

/**
 * Pausas são o fim de uma partida da roleta ou de uma fase do Golem World. A cada 3 a 5
 * pausas vem um anúncio, nunca no meio de uma pergunta nem ao abrir o jogo. Antes dele,
 * o jogo oferece um presente para quem quiser assistir à versão com prêmio; quem recusa
 * vê o anúncio comum (sem prêmio, como mandam as regras do AdMob).
 *
 * Assistir a um anúncio com prêmio por vontade própria conta como anúncio visto: quem
 * assiste sempre quase não vê os obrigatórios; quem pula todos vê um a cada 3 a 5 pausas.
 * Quem compra "Sem anúncios" não vê mais os obrigatórios; os com prêmio continuam lá.
 */
export const AD_RULES = {
  breaksMin: 3,
  breaksMax: 5,
  /** Intervalo mínimo entre dois anúncios, para nunca empilhar. */
  minGapSeconds: 120,
} as const;

export interface AdPacing {
  /** Pausas desde o último anúncio. */
  breaks: number;
  /** Em quantas pausas vem o próximo (sorteado entre breaksMin e breaksMax). */
  target: number;
  lastAdAt: Date | null;
}

export type BreakDecision = 'none' | 'ad';

/** Conta uma pausa e decide se é hora do anúncio obrigatório. */
export function registerBreak(pacing: AdPacing, now: Date, adFree: boolean): { decision: BreakDecision; breaks: number } {
  if (adFree) return { decision: 'none', breaks: 0 };
  const breaks = pacing.breaks + 1;
  const gapOk = !pacing.lastAdAt || now.getTime() - pacing.lastAdAt.getTime() >= AD_RULES.minGapSeconds * 1000;
  return breaks >= pacing.target && gapOk ? { decision: 'ad', breaks } : { decision: 'none', breaks };
}

/** Depois de qualquer anúncio (obrigatório ou com prêmio): zera e sorteia a próxima meta. */
export function pacingAfterAd(now: Date, randomInt: (maxExclusive: number) => number): AdPacing {
  return { breaks: 0, target: AD_RULES.breaksMin + randomInt(AD_RULES.breaksMax - AD_RULES.breaksMin + 1), lastAdAt: now };
}

// ---------------------------------------------------------------------------
// Aplicação de um prêmio (pura): quanto muda em cada saldo
// ---------------------------------------------------------------------------

export interface PrizeEffect {
  coins: number;
  shekels: number;
  lives: number;
  boosts: Partial<Record<BoostKind, number>>;
  /** Volta à fase com 1 coração. */
  revive: boolean;
  /** Jogadas a mais na partida do "Pedras do Choshen". */
  moves: number;
}

export function prizeEffect(prize: Prize): PrizeEffect {
  const none: PrizeEffect = { coins: 0, shekels: 0, lives: 0, boosts: {}, revive: false, moves: 0 };
  switch (prize.kind) {
    case 'coins':
    case 'double':
      return { ...none, coins: prize.amount };
    case 'shekels':
      return { ...none, shekels: prize.amount };
    case 'life':
      return { ...none, lives: prize.amount };
    case 'boost':
      return { ...none, boosts: { [prize.boost]: prize.amount } };
    case 'heart':
      return { ...none, revive: true };
    case 'moves':
      return { ...none, moves: prize.amount };
  }
}
