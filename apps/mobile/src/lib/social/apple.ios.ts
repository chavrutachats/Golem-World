/**
 * Entrar com a Apple, no iPhone (obrigatório pela App Store quando o app oferece login
 * do Google ou do Facebook). A Apple manda o nome só na primeira vez.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeNonce } from './nonce';
import type { SocialAdapter } from './types';

export const apple: SocialAdapter = {
  provider: 'apple',
  available: () => AppleAuthentication.isAvailableAsync().catch(() => false),
  async signIn() {
    const nonce = await makeNonce();
    try {
      const res = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: nonce.hashed,
      });
      if (!res.identityToken) return null;
      const name = res.fullName?.givenName ?? undefined;
      return { provider: 'apple', token: res.identityToken, nonce: nonce.raw, ...(name ? { displayName: name } : {}) };
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
      throw e;
    }
  },
};
