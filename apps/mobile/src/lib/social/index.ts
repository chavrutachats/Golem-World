/**
 * Login social no app: quais botões aparecem (o servidor aceita E o aparelho consegue)
 * e o fluxo (provedor → servidor → sessão).
 */
import { useQuery } from '@tanstack/react-query';
import { SOCIAL_PROVIDERS, type SocialProvider } from '@trivia/shared';
import { currentLocale } from '../i18n';
import { api } from '../session';
import { apple } from './apple';
import { facebook } from './facebook';
import { google } from './google';
import type { SocialAdapter } from './types';

const ADAPTERS: Readonly<Record<SocialProvider, SocialAdapter>> = { google, apple, facebook };

export const SOCIAL_NAMES: Readonly<Record<SocialProvider, string>> = { google: 'Google', apple: 'Apple', facebook: 'Facebook' };

/** Logins que funcionam aqui, na ordem dos botões. */
export function useSocialProviders() {
  return useQuery({
    queryKey: ['auth-providers'],
    queryFn: async () => {
      const server = await api.auth.providers().catch(() => ({ google: false, apple: false, facebook: false }));
      const ok = await Promise.all(SOCIAL_PROVIDERS.map(async (p) => server[p] && (await ADAPTERS[p].available())));
      return SOCIAL_PROVIDERS.filter((_, i) => ok[i]);
    },
    staleTime: 10 * 60_000,
  });
}

/**
 * Entra (ou liga o login à conta aberta). Devolve false se o jogador cancelou no
 * provedor; erros do servidor (conta já ligada a outro jogador…) sobem como ApiError.
 */
export async function signInWith(provider: SocialProvider): Promise<boolean> {
  const cred = await ADAPTERS[provider].signIn();
  if (!cred) return false;
  await api.auth.social({ ...cred, locale: currentLocale() });
  return true;
}
