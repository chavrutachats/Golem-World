/**
 * Anúncio e loja de demonstração: na web (pnpm lan), no Expo Go e quando o servidor
 * está em modo demo. O anúncio é uma tela do próprio jogo com contagem regressiva; a
 * compra pede confirmação e avisa que nada é cobrado. O servidor só aceita isso fora
 * de produção (ADS_MODE=demo, STORE_MODE=demo).
 */
import { ask } from './host';
import type { AdOutcome, AdsAdapter, DevicePurchase, StoreAdapter } from './types';

/** Id de compra de demonstração (o servidor exige o formato de UUID). */
function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const demoAds: AdsAdapter = {
  kind: 'demo',
  showRewarded: () => ask<AdOutcome>({ kind: 'demoAd', rewarded: true }),
  showInterstitial: async () => {
    await ask<AdOutcome>({ kind: 'demoAd', rewarded: false });
  },
};

export const demoStore: StoreAdapter = {
  kind: 'demo',
  async products(ids) {
    return ids.map((id) => ({ id, price: null }));
  },
  async purchase(productId): Promise<DevicePurchase | null> {
    const confirmed = await ask<boolean>({ kind: 'demoPurchase', productId });
    if (!confirmed) return null;
    return { request: { store: 'demo', productId, receipt: uuid() }, finish: async () => {} };
  },
  async pending() {
    return [];
  },
};
