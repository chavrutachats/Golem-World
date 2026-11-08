/** Na web não há AdMob: o jogo usa o anúncio de demonstração (ou nenhum). */
import type { AdsAdapter } from './types';

export function createAdmobAdapter(): AdsAdapter | null {
  return null;
}
