/** Entrar com a Apple só no iPhone (no Android e na web o botão não aparece). */
import type { SocialAdapter } from './types';

export const apple: SocialAdapter = {
  provider: 'apple',
  available: async () => false,
  signIn: async () => null,
};
