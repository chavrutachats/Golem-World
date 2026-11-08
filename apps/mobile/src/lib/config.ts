/**
 * Endereço da API.
 *
 * 1. Na web servida pela própria API (`pnpm lan`), a página traz
 *    <meta name="trivia-api" content="/api">: mesma origem, sem CORS, de qualquer
 *    aparelho da rede. Vale mais que tudo, porque é o servidor que está respondendo.
 * 2. EXPO_PUBLIC_API_URL, se definida (obrigatória em builds de produção).
 * 3. Em desenvolvimento, o mesmo computador que serve o app pelo Expo, na porta 3000:
 *    funciona no Expo Go do celular sem configurar nada, desde que estejam na mesma rede.
 * 4. Na web do Metro (expo start --web), o mesmo host da página, na porta 3000.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 3000;

/** A página web veio da própria API (`pnpm lan`)? Então a API está no mesmo endereço. */
export function servedByApi(): string | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  const meta = document.querySelector('meta[name="trivia-api"]')?.getAttribute('content')?.trim();
  if (!meta || !meta.startsWith('/')) return null;
  return `${window.location.origin}${meta.replace(/\/+$/, '')}`;
}

export function resolveApiBaseUrl(): string {
  const sameOrigin = servedByApi();
  if (sameOrigin) return sameOrigin;
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:${API_PORT}`;
  return `http://localhost:${API_PORT}`;
}
