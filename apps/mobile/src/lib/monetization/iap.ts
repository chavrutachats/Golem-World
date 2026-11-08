/** Na web não há App Store nem Google Play: compras só no app instalado (ou de demonstração). */
import type { StoreAdapter } from './types';

export function createIapStore(): StoreAdapter | null {
  return null;
}
