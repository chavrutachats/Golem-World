/**
 * Espera o servidor preparar uma fase ou a roleta no idioma do jogador (Fase 8).
 * Pergunta de novo a cada pouco enquanto o status for "preparing" e avisa o
 * progresso; termina em "ready" ou "unavailable" (ou no erro da chamada).
 */
import type { PrepStatus } from '@trivia/shared';

export interface WaitOptions {
  onProgress?: (status: PrepStatus) => void;
  intervalMs?: number;
  /** Limite total de espera; depois disso, devolve o último status. */
  timeoutMs?: number;
  isAlive?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}

export async function waitForPrep(fetch: () => Promise<PrepStatus>, options: WaitOptions = {}): Promise<PrepStatus> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const interval = options.intervalMs ?? 1200;
  const deadline = Date.now() + (options.timeoutMs ?? 5 * 60_000);
  let status = await fetch();
  while (status.status === 'preparing') {
    options.onProgress?.(status);
    if (options.isAlive && !options.isAlive()) return status;
    if (Date.now() > deadline) return status;
    await sleep(interval);
    status = await fetch();
  }
  return status;
}
