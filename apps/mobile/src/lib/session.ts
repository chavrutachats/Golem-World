/**
 * Sessão do jogador: o cliente da API e o estado de login, acessíveis em qualquer tela.
 */
import type { PublicUser } from '@trivia/shared';
import { create } from 'zustand';
import { createApiClient } from './api-core';
import { currentLocale } from './i18n';
import { resolveApiBaseUrl, servedByApi } from './config';
import { tokenStore } from './storage';

type Status = 'starting' | 'signedOut' | 'signedIn';

interface SessionState {
  status: Status;
  user: PublicUser | null;
  /** Erro ao retomar a sessão (ex.: API fora do ar), para a tela inicial explicar. */
  bootError: string | null;
  /**
   * Há uma sessão guardada que não deu para validar agora (rede, servidor ocupado).
   * A tela inicial oferece "Tentar de novo" em vez de criar outra conta por cima,
   * o que faria um convidado perder a dele.
   */
  pendingRestore: boolean;
}

export const useSession = create<SessionState>(() => ({ status: 'starting', user: null, bootError: null, pendingRestore: false }));

export const api = createApiClient({
  baseUrl: resolveApiBaseUrl(),
  tokenStore,
  // Builds de produção só falam com a API por https, a não ser que a página web tenha
  // vindo da própria API (mesmo endereço: a API não é mais exposta do que a página).
  requireHttps: !__DEV__ && !servedByApi(),
  locale: currentLocale,
  onSession: (user) =>
    useSession.setState(
      user ? { status: 'signedIn', user, bootError: null, pendingRestore: false } : { status: 'signedOut', user: null, pendingRestore: false },
    ),
});

/** Retoma a sessão salva no aparelho, se houver. */
export async function bootSession(): Promise<void> {
  try {
    const ok = await api.restore();
    if (!ok) useSession.setState({ status: 'signedOut', user: null, pendingRestore: false });
  } catch (error) {
    const pendingRestore = await api.hasStoredSession().catch(() => false);
    useSession.setState({
      status: 'signedOut',
      user: null,
      pendingRestore,
      bootError: error instanceof Error ? error.message : String(error),
    });
  }
}

export function updateUser(patch: Partial<PublicUser>): void {
  const { user } = useSession.getState();
  if (user) useSession.setState({ user: { ...user, ...patch } });
}
