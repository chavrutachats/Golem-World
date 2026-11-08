/**
 * Compras de verdade (App Store / Google Play) pelo expo-iap, só no app instalado.
 * O fluxo da loja é por eventos: pede a compra e espera o evento de sucesso ou erro.
 * Quem entrega é sempre o servidor, que confere com a loja; só depois a transação é
 * fechada (consumida, no caso dos pacotes de shekels).
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type { DevicePurchase, StoreAdapter } from './types';

type Iap = typeof import('expo-iap');
type IapPurchase = Parameters<Parameters<Iap['purchaseUpdatedListener']>[0]>[0];

export function createIapStore(): StoreAdapter | null {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  let iap: Iap;
  try {
    iap = require('expo-iap') as Iap;
  } catch {
    return null;
  }
  const store = Platform.OS === 'ios' ? ('apple' as const) : ('google' as const);
  let connected: Promise<unknown> | null = null;
  const connect = () =>
    (connected ??= iap.initConnection().catch((e: unknown) => {
      connected = null;
      throw e;
    }));

  const toDevice = (p: IapPurchase): DevicePurchase | null => {
    if (!p.purchaseToken) return null;
    return {
      request: { store, productId: p.productId, receipt: p.purchaseToken },
      finish: async (consumable) => {
        await iap.finishTransaction({ purchase: p, isConsumable: consumable });
      },
    };
  };

  return {
    kind: store,
    async products(ids) {
      await connect();
      const list = (await iap.fetchProducts({ skus: [...ids], type: 'in-app' })) ?? [];
      return (list as { id: string; displayPrice?: string }[]).map((p) => ({ id: p.id, price: p.displayPrice ?? null }));
    },
    async purchase(productId, accountId) {
      await connect();
      return new Promise<DevicePurchase | null>((resolve, reject) => {
        const ok = iap.purchaseUpdatedListener((p) => {
          if (p.productId !== productId) return;
          cleanup();
          const device = toDevice(p);
          if (device) resolve(device);
          else reject(new Error('Compra sem comprovante da loja.'));
        });
        const fail = iap.purchaseErrorListener((e) => {
          cleanup();
          if (iap.isUserCancelledError(e)) resolve(null);
          else reject(new Error(e.message));
        });
        const cleanup = () => {
          ok.remove();
          fail.remove();
        };
        iap
          .requestPurchase({
            type: 'in-app',
            request: { apple: { sku: productId, appAccountToken: accountId }, google: { skus: [productId], obfuscatedAccountId: accountId } },
          })
          .catch((e: unknown) => {
            cleanup();
            reject(e instanceof Error ? e : new Error(String(e)));
          });
      });
    },
    async pending({ sync }) {
      await connect();
      if (sync) await iap.restorePurchases().catch(() => undefined);
      const list = ((await iap.getAvailablePurchases()) ?? []) as IapPurchase[];
      return list.map(toDevice).filter((d): d is DevicePurchase => d !== null);
    },
  };
}
