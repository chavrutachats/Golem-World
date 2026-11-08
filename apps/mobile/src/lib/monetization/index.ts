/**
 * Economia no app: escolhe os adaptadores (AdMob/lojas no app instalado, demonstração
 * na web e no Expo Go) conforme o que o servidor permite, e conduz os fluxos:
 *
 * - prêmio de anúncio: oferta (o prêmio aparece antes) → anúncio → confirmação →
 *   resgate (com algumas tentativas, porque a confirmação do Google leva segundos);
 * - pausa: o servidor diz se é hora do anúncio obrigatório; antes dele, o presente;
 * - compra: loja → servidor confere e entrega → a transação é fechada na loja.
 *
 * O saldo novo volta em cada resposta e vai direto para o cache das telas.
 */
import { useQuery } from '@tanstack/react-query';
import {
  storeProduct,
  type AdPlacement,
  type AdsMode,
  type BoostKind,
  type EconomyState,
  type Prize,
  type PurchaseResult,
  type RewardTicket,
  type StoreMode,
} from '@trivia/shared';
import { ApiError } from '../api-core';
import { msg, t, tn } from '../i18n';
import { keys, queryClient } from '../queries';
import { api, useSession } from '../session';
import { createAdmobAdapter } from './admob';
import { demoAds, demoStore } from './demo';
import { ask, notify } from './host';
import { createIapStore } from './iap';
import type { AdsAdapter, StoreAdapter, StoreProductView } from './types';

export { notify } from './host';
export type { AdsAdapter, StoreAdapter, StoreProductView } from './types';

let admob: AdsAdapter | null | undefined;
let iap: StoreAdapter | null | undefined;

/** O anúncio que vale aqui: o de verdade (se o app tem AdMob) ou o de demonstração. */
export function adsFor(mode: AdsMode): AdsAdapter | null {
  if (mode === 'off') return null;
  if (mode === 'demo') return demoAds;
  if (admob === undefined) admob = createAdmobAdapter();
  // Servidor com anúncios reais, mas aparelho sem AdMob (web, Expo Go): sem prêmio por anúncio.
  return admob;
}

export function storeFor(mode: StoreMode): StoreAdapter | null {
  if (mode === 'off') return null;
  if (mode === 'demo') return demoStore;
  if (iap === undefined) iap = createIapStore();
  return iap;
}

export function useEconomy() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  return useQuery({ queryKey: keys.economy, queryFn: () => api.economy.state(), enabled: signedIn, staleTime: 15_000 });
}

/** Adaptadores e saldo da tela atual. */
export function useMonetization() {
  const { data: economy } = useEconomy();
  return {
    economy,
    ads: economy ? adsFor(economy.ads.mode) : null,
    store: economy ? storeFor(economy.store.mode) : null,
  };
}

function current(): { economy: EconomyState | undefined; ads: AdsAdapter | null; store: StoreAdapter | null } {
  const economy = queryClient.getQueryData<EconomyState>(keys.economy);
  return { economy, ads: economy ? adsFor(economy.ads.mode) : null, store: economy ? storeFor(economy.store.mode) : null };
}

/** Saldo novo vindo do servidor: atualiza a carteira e o que depende dela. */
export function applyEconomy(economy: EconomyState): void {
  queryClient.setQueryData(keys.economy, economy);
  void queryClient.invalidateQueries({ queryKey: keys.journey });
  void queryClient.invalidateQueries({ queryKey: keys.me });
}

// ---------------------------------------------------------------------------
// Textos dos prêmios
// ---------------------------------------------------------------------------

const BOOST_NAMES = { time: msg('+10 segundos'), skip: msg('Pular pergunta'), eliminate: msg('Eliminar 2 erradas') } as const;

export function boostName(kind: BoostKind): string {
  return t(BOOST_NAMES[kind]);
}

/** "+15 moedas", "+1 vida", "Ajuda: +10 segundos"… */
export function prizeLabel(prize: Prize): string {
  switch (prize.kind) {
    case 'coins':
    case 'double':
      return tn(prize.amount, '+{n} moeda', '+{n} moedas');
    case 'shekels':
      return tn(prize.amount, '+{n} shekel', '+{n} shekels');
    case 'life':
      // As vidas são as do sevivon: dito com todas as letras, para ninguém achar que perdeu uma no puzzle.
      return tn(prize.amount, '+{n} vida no sevivon', '+{n} vidas no sevivon');
    case 'boost':
      return t('Ajuda: {name}', { name: boostName(prize.boost) });
    case 'heart':
      return t('Continuar com 1 coração');
    case 'moves':
      return tn(prize.amount, '+{n} jogada', '+{n} jogadas');
  }
}

// ---------------------------------------------------------------------------
// Anúncios com prêmio
// ---------------------------------------------------------------------------

export type RewardOutcome = 'claimed' | 'pending' | 'skipped' | 'failed' | 'unavailable';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pede a oferta: o prêmio vem aqui, para a tela mostrar antes do anúncio. */
export function offerReward(placement: AdPlacement, ref?: string): Promise<RewardTicket> {
  return api.economy.offer(placement, ref);
}

/** Mostra o anúncio e resgata o prêmio. */
export async function watchReward(ticket: RewardTicket, opts: { interstitial?: boolean } = {}): Promise<RewardOutcome> {
  const { economy, ads } = current();
  const userId = useSession.getState().user?.id;
  if (!economy || !ads || !userId) return 'unavailable';
  const outcome = await ads.showRewarded({ userId, customData: ticket.ssvCustomData, interstitial: opts.interstitial });
  if (outcome === 'failed') {
    notify(t('O anúncio não carregou agora. Tente de novo daqui a pouco.'));
    return 'failed';
  }
  if (outcome === 'dismissed') return 'skipped';
  // Com anúncios reais, quem confirma é o Google (direto no servidor).
  if (economy.ads.mode !== 'admob') await api.economy.watched(ticket.id);
  for (const wait of [0, 800, 1500, 2500, 4000, 6000]) {
    await sleep(wait);
    const res = await api.economy.claim(ticket.id);
    if (res.status === 'claimed') {
      applyEconomy(res.economy);
      return 'claimed';
    }
  }
  notify(t('Seu prêmio está a caminho: ele aparece em instantes.'));
  return 'pending';
}

/** Oferta + anúncio + resgate, para os lugares em que o prêmio já é conhecido (vida, continuar…). */
export async function earnReward(placement: AdPlacement, ref?: string): Promise<RewardOutcome> {
  try {
    const ticket = await offerReward(placement, ref);
    const result = await watchReward(ticket);
    if (result === 'claimed') notify(prizeLabel(ticket.prize));
    return result;
  } catch (e) {
    notify(e instanceof ApiError ? e.message : t('Algo deu errado. Tente de novo.'));
    return 'failed';
  }
}

// ---------------------------------------------------------------------------
// Pausas
// ---------------------------------------------------------------------------

/**
 * Fim de partida ou de fase. Se for a hora do anúncio obrigatório, oferece antes o
 * presente; quem recusa vê o anúncio comum. Nunca durante uma pergunta: quem chama
 * é a tela de fim.
 */
export async function adBreak(kind: 'match' | 'level'): Promise<void> {
  const { economy, ads } = current();
  if (!economy || economy.adFree || !ads) return;
  let res;
  try {
    res = await api.economy.adBreak(kind);
  } catch {
    return;
  }
  if (res.action === 'none') return;
  if (res.gift && (await ask<boolean>({ kind: 'gift', ticket: res.gift }))) {
    const result = await watchReward(res.gift, { interstitial: true });
    if (result === 'claimed') notify(prizeLabel(res.gift.prize));
    if (result !== 'failed') return;
  }
  await ads.showInterstitial();
}

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------

export function useStoreProducts(ids: readonly string[]) {
  const { store } = useMonetization();
  return useQuery<StoreProductView[]>({
    queryKey: ['store-products', store?.kind ?? 'none', ...ids],
    queryFn: () => (store ? store.products(ids) : Promise.resolve([])),
    enabled: !!store,
    staleTime: 60 * 60_000,
  });
}

/** Compra um produto da loja. null: cancelada (ou loja indisponível). */
export async function buyProduct(productId: string): Promise<PurchaseResult | null> {
  const { store } = current();
  const userId = useSession.getState().user?.id;
  const product = storeProduct(productId);
  if (!store || !userId || !product) return null;
  const device = await store.purchase(productId, userId);
  if (!device) return null;
  const res = await api.economy.purchase(device.request);
  // Só depois de entregue a transação sai da fila da loja (e o pacote pode ser comprado de novo).
  await device.finish(product.consumable).catch(() => undefined);
  applyEconomy(res.economy);
  notify(res.granted.adFree ? t('Pronto: sem anúncios obrigatórios.') : tn(res.granted.shekels, '+{n} shekel', '+{n} shekels'));
  return res;
}

/**
 * Entrega o que a loja ainda guarda: compras interrompidas (o app fechou no meio) e,
 * com `sync`, a restauração do "Sem anúncios" num aparelho novo.
 */
export async function restorePurchases(sync: boolean): Promise<number> {
  const { store } = current();
  if (!store) return 0;
  let delivered = 0;
  for (const device of await store.pending({ sync })) {
    try {
      const res = await api.economy.purchase(device.request);
      await device.finish(storeProduct(device.request.productId)?.consumable ?? false).catch(() => undefined);
      applyEconomy(res.economy);
      delivered++;
    } catch {
      // Compra de outra conta ou recusada pela loja: fica para a loja resolver.
    }
  }
  return delivered;
}

/** Nome de um produto da loja para as telas. */
export function productName(productId: string): string {
  const p = storeProduct(productId);
  if (!p) return productId;
  return p.kind === 'noAds' ? t('Sem anúncios') : tn(p.amount, '{n} shekel', '{n} shekels');
}

