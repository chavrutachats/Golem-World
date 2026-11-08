/**
 * Pedidos de tela da economia: o anúncio de demonstração, o aviso do presente antes do
 * anúncio de pausa, a confirmação da compra de demonstração e os avisos curtos. Quem
 * desenha é o <MonetizationHost /> (montado uma vez no layout); quem pede espera a
 * resposta numa Promise. Um pedido por vez: os outros esperam na fila.
 */
import type { RewardTicket } from '@trivia/shared';
import { create } from 'zustand';
import type { AdOutcome } from './types';

export type HostRequest =
  | { kind: 'demoAd'; rewarded: boolean; resolve: (outcome: AdOutcome) => void }
  | { kind: 'gift'; ticket: RewardTicket; resolve: (accept: boolean) => void }
  | { kind: 'demoPurchase'; productId: string; resolve: (confirmed: boolean) => void };

type Pending = { [K in HostRequest['kind']]: Omit<Extract<HostRequest, { kind: K }>, 'resolve'> }[HostRequest['kind']];

interface HostState {
  request: HostRequest | null;
  queue: HostRequest[];
  notice: { key: number; text: string } | null;
}

export const useMonetizationHost = create<HostState>(() => ({ request: null, queue: [], notice: null }));

function next(): void {
  const { request, queue } = useMonetizationHost.getState();
  if (request || queue.length === 0) return;
  const [head, ...rest] = queue;
  useMonetizationHost.setState({ request: head!, queue: rest });
}

/** Pede uma tela e espera a resposta. */
export function ask<T>(pending: Pending): Promise<T> {
  return new Promise<T>((resolve) => {
    const finish = (value: T) => {
      useMonetizationHost.setState({ request: null });
      resolve(value);
      next();
    };
    const request = { ...pending, resolve: finish } as unknown as HostRequest;
    useMonetizationHost.setState((s) => ({ queue: [...s.queue, request] }));
    next();
  });
}

/** Aviso curto no rodapé ("+1 vida!", "Compra cancelada"). */
export function notify(text: string): void {
  useMonetizationHost.setState({ notice: { key: Date.now(), text } });
}
