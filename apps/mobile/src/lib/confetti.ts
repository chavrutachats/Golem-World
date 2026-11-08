/**
 * Partículas de confete: parâmetros sorteados uma vez por explosão (com semente, para
 * ser previsível em teste) e posição calculada como um lançamento com gravidade.
 */
export interface Particle {
  vx: number;
  vy: number;
  spin: number;
  size: number;
  round: boolean;
  color: string;
}

/** Gerador pseudoaleatório pequeno e determinístico (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeParticles(count: number, colors: readonly string[], seed: number, power = 1): Particle[] {
  const rand = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    vx: (rand() * 2 - 1) * 170 * power,
    vy: -(200 + rand() * 260) * power,
    spin: (rand() * 2 - 1) * 720,
    size: 6 + rand() * 6,
    round: rand() < 0.35,
    color: colors[i % colors.length]!,
  }));
}

/** Gravidade em px por (unidade de tempo)², com o tempo da explosão indo de 0 a 1. */
export const GRAVITY = 900;

/** Posição da partícula no instante t (0 a 1). Usada também dentro de worklets. */
export function particleAt(p: Pick<Particle, 'vx' | 'vy' | 'spin'>, t: number): { x: number; y: number; rotate: number; opacity: number } {
  'worklet';
  return {
    x: p.vx * t,
    y: p.vy * t + 0.5 * GRAVITY * t * t,
    rotate: p.spin * t,
    opacity: t < 0.7 ? 1 : Math.max(0, (1 - t) / 0.3),
  };
}
