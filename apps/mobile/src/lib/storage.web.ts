/** Na versão web não há chaveiro seguro: o refresh token fica no localStorage do navegador. */
import type { TokenStore } from './api-core';

const KEY = 'trivia.refreshToken';

export const tokenStore: TokenStore = {
  async getRefreshToken() {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  async setRefreshToken(token) {
    try {
      if (token) window.localStorage.setItem(KEY, token);
      else window.localStorage.removeItem(KEY);
    } catch {
      // modo privado ou armazenamento bloqueado: a sessão dura só esta aba
    }
  },
};
