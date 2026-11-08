import { createHash } from 'node:crypto';
import path from 'node:path';

/**
 * path.join que se recusa a sair de `root`. Os caminhos montados a partir do
 * books.json (dado baixado da internet) passam por aqui: um título como
 * "../../.ssh/x" não consegue gravar nem ler fora da pasta do export.
 */
export function safeJoin(root: string, ...parts: string[]): string {
  const base = path.resolve(root);
  const full = path.resolve(base, ...parts);
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error(`Caminho fora da pasta permitida: ${parts.join('/')}`);
  }
  return full;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Executa `fn` sobre os itens com no máximo `limit` chamadas simultâneas, preservando a ordem do resultado. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Repete `fn` em erros transitórios, com espera exponencial. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 1000, label = 'operação' }: { attempts?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const delay = baseDelayMs * 2 ** (attempt - 1);
        log.warn(`${label} falhou (tentativa ${attempt}/${attempts}); nova tentativa em ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Permutação determinística de [0..n): a mesma semente sempre gera a mesma ordem.
 * Usada para embaralhar alternativas antes do verificador de forma reprodutível.
 */
export function seededPermutation(n: number, seed: string): number[] {
  let state = parseInt(sha256(seed).slice(0, 8), 16) || 1;
  const random = () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Logger mínimo; saída em stderr para não poluir relatórios enviados ao stdout. */
export const log = {
  info: (msg: string) => process.stderr.write(`${msg}\n`),
  warn: (msg: string) => process.stderr.write(`⚠ ${msg}\n`),
  error: (msg: string) => process.stderr.write(`✖ ${msg}\n`),
};
