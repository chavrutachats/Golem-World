/**
 * Contratos dos adaptadores de anúncio e de loja. Cada plataforma tem o seu:
 * AdMob e App Store/Google Play no app instalado; versões de demonstração na web,
 * no Expo Go e nos testes (desenhadas pelo próprio jogo, sem cobrar nada).
 */
import type { PurchaseRequest, StoreName } from '@trivia/shared';

/** Como terminou um anúncio com prêmio. */
export type AdOutcome = 'earned' | 'dismissed' | 'failed';

export interface AdsAdapter {
  readonly kind: 'admob' | 'demo';
  /**
   * Mostra um anúncio com prêmio. `customData` e `userId` vão para a confirmação do
   * Google (SSV): é por eles que o servidor sabe qual prêmio liberar.
   * `interstitial`: formato de pausa (com a tela de aviso antes, mostrada pelo jogo).
   */
  showRewarded(opts: { userId: string; customData: string; interstitial?: boolean }): Promise<AdOutcome>;
  /** Anúncio comum de pausa (sem prêmio). */
  showInterstitial(): Promise<void>;
}

export interface StoreProductView {
  id: string;
  /** Preço já formatado pela loja, na moeda do jogador ("R$ 4,90"). */
  price: string | null;
}

/** Uma compra concluída no aparelho, ainda por entregar pelo servidor. */
export interface DevicePurchase {
  request: PurchaseRequest;
  /** Fecha a transação na loja depois que o servidor entregou. */
  finish(consumable: boolean): Promise<void>;
}

export interface StoreAdapter {
  readonly kind: StoreName;
  products(ids: readonly string[]): Promise<StoreProductView[]>;
  /** null: o jogador cancelou. `accountId` liga a compra à conta do jogo (anti-fraude). */
  purchase(productId: string, accountId: string): Promise<DevicePurchase | null>;
  /**
   * Compras que a loja ainda guarda (compras interrompidas e, com `sync`, a
   * restauração, que no iPhone pode pedir a senha da Apple).
   */
  pending(opts: { sync: boolean }): Promise<DevicePurchase[]>;
}
