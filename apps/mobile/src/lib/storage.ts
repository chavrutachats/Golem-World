/**
 * Refresh token no chaveiro do aparelho (iOS Keychain / Android Keystore).
 *
 * WHEN_UNLOCKED_THIS_DEVICE_ONLY: só pode ser lido com o aparelho desbloqueado e nunca
 * vai para backup do iCloud nem para outro aparelho. Num celular novo, quem tem conta
 * entra com e-mail e senha.
 *
 * Migração: até a versão anterior o token ficava em outra chave, sem o THIS_DEVICE_ONLY,
 * e o iOS não muda essa proteção de um item que já existe. Por isso a chave nova é outra:
 * o token antigo é lido uma vez, regravado na chave nova e só então apagado (se a
 * gravação falhar, nada se perde).
 */
import * as SecureStore from 'expo-secure-store';
import type { TokenStore } from './api-core';

const KEY = 'trivia.refreshToken.v2';
const LEGACY_KEY = 'trivia.refreshToken';
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const tokenStore: TokenStore = {
  async getRefreshToken() {
    return (await SecureStore.getItemAsync(KEY, OPTIONS)) ?? (await SecureStore.getItemAsync(LEGACY_KEY).catch(() => null));
  },
  async setRefreshToken(token) {
    if (token) {
      await SecureStore.setItemAsync(KEY, token, OPTIONS);
      await SecureStore.deleteItemAsync(LEGACY_KEY).catch(() => undefined);
    } else {
      await SecureStore.deleteItemAsync(KEY, OPTIONS);
      await SecureStore.deleteItemAsync(LEGACY_KEY).catch(() => undefined);
    }
  },
};
