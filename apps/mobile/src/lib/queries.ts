/**
 * Dados do servidor via React Query. As chaves ficam aqui para as telas
 * invalidarem exatamente o que muda depois de cada jogada.
 */
import { QueryClient, useQuery } from '@tanstack/react-query';
import type { GamePhase, QuestionForPlayer, RankingPeriod } from '@trivia/shared';
import { ApiError } from './api-core';
import { api } from './session';
import { msg, t } from './i18n';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      staleTime: 5_000,
    },
  },
});

export const keys = {
  games: ['games'] as const,
  game: (id: string) => ['game', id] as const,
  question: (id: string) => ['question', id] as const,
  me: ['me'] as const,
  ranking: (period: RankingPeriod) => ['ranking', period] as const,
  journey: ['journey'] as const,
  shop: ['journey', 'shop'] as const,
  /** Carteira, mochila, vidas e "Sem anúncios" (Fase 9). */
  economy: ['economy'] as const,
  /** Fases e estrelas do "Pedras do Choshen" (Fase 11). */
  puzzle: ['puzzle'] as const,
};

/** Mapa do Golem World (progresso, moedas, visual do Golem). */
export function useJourney() {
  return useQuery({ queryKey: keys.journey, queryFn: () => api.journey.state() });
}

export function useShop() {
  return useQuery({ queryKey: keys.shop, queryFn: () => api.journey.shop() });
}

/** Pergunta guardada com o instante em que chegou (para corrigir o relógio do aparelho). */
export interface CachedQuestion {
  question: QuestionForPlayer;
  receivedAt: number;
}

/** Fases em que o app consulta a partida sozinho, esperando o outro jogador. */
const WAITING: readonly GamePhase[] = ['opponent_turn', 'waiting_opponent'];

export function useGame(id: string) {
  return useQuery({
    queryKey: keys.game(id),
    queryFn: () => api.games.state(id),
    refetchInterval: (q) => (q.state.data && WAITING.includes(q.state.data.phase) ? 4_000 : false),
  });
}

export function useMyGames() {
  return useQuery({ queryKey: keys.games, queryFn: () => api.games.list(), refetchInterval: 15_000 });
}

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api.me.get() });
}

export function useRanking(period: RankingPeriod) {
  return useQuery({ queryKey: keys.ranking(period), queryFn: () => api.ranking(period) });
}

/** Mensagens montadas no app com partes variáveis: traduzidas pelo código do erro. */
const BY_CODE: Readonly<Record<string, string>> = {
  NETWORK: msg('Não foi possível falar com o servidor. Confira se a API está rodando e se o aparelho está na mesma rede.'),
  INSECURE_API_URL: msg('O app está configurado com um endereço sem https. Em produção, defina EXPO_PUBLIC_API_URL com https://.'),
  BAD_RESPONSE: msg('A resposta do servidor veio num formato inesperado. Atualize o app e a API.'),
};

/**
 * Mensagem de erro no idioma do jogador. O servidor escreve em português; as
 * mensagens conhecidas estão nos dicionários e as outras aparecem como vieram.
 */
export function errorMessage(error: unknown): string {
  // Para entrada inválida, o motivo exato (ex.: "Este nome é reservado…") vale mais que "Dados inválidos."
  if (error instanceof ApiError && error.code === 'INVALID_INPUT' && error.issues[0]?.message) return t(error.issues[0].message);
  if (error instanceof ApiError && BY_CODE[error.code]) return t(BY_CODE[error.code]!);
  if (error instanceof ApiError && /^HTTP_\d+$/.test(error.code)) return t('O servidor respondeu com erro {status}.', { status: error.status });
  if (error instanceof Error) return t(error.message);
  return t('Algo deu errado. Tente de novo.');
}
