/**
 * Gerador pseudoaleatório com estado num único inteiro (mulberry32). Só aritmética de
 * 32 bits: o app e o servidor tiram exatamente a mesma sequência da mesma semente, e o
 * servidor consegue refazer a partida inteira a partir das jogadas.
 */

export interface Rng {
  /** Estado atual (salvo junto com a partida). */
  s: number;
}

/** Próximo número de 32 bits sem sinal. */
export function nextU32(rng: Rng): number {
  rng.s = (rng.s + 0x6d2b79f5) | 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Inteiro em [0, n). */
export function nextInt(rng: Rng, n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError(`nextInt: n inválido (${n})`);
  return nextU32(rng) % n;
}

/** Semente a partir de um texto (FNV-1a de 32 bits), para os níveis fixos. */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
