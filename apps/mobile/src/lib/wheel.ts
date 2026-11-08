/**
 * Geometria da roleta. O servidor sorteia a fatia; o app só calcula quanto girar
 * para que o yad (o ponteiro, no alto) pare exatamente sobre ela.
 *
 * Convenção: ângulos em graus, no sentido horário, a partir do topo (12 h).
 * A fatia i ocupa [i·A, (i+1)·A), com A = 360 / quantidade de fatias.
 * Girar a roda em R graus (horário) leva o ponto de ângulo θ para θ + R.
 */
import { WHEEL_SLICES } from '@trivia/shared';

export const SLICE_COUNT = WHEEL_SLICES.length;
export const SLICE_ANGLE = 360 / SLICE_COUNT;

export function mod(value: number, m: number): number {
  return ((value % m) + m) % m;
}

export function sliceCenterAngle(index: number): number {
  return (index + 0.5) * SLICE_ANGLE;
}

/** Rotação (0–360) que deixa o centro da fatia sob o ponteiro. */
export function restingRotation(index: number): number {
  return mod(360 - sliceCenterAngle(index), 360);
}

/** Qual fatia está sob o ponteiro para uma rotação qualquer da roda. */
export function sliceUnderPointer(rotation: number): number {
  return Math.floor(mod(-rotation, 360) / SLICE_ANGLE) % SLICE_COUNT;
}

/**
 * Quantos cravos do aro já passaram pelo ponteiro para uma rotação acumulada.
 * Os cravos ficam nas divisas das fatias (ângulos múltiplos de SLICE_ANGLE); um cravo
 * passa pelo topo quando a rotação cruza um múltiplo de SLICE_ANGLE.
 */
export function pegsPassed(rotation: number): number {
  'worklet';
  return Math.floor(rotation / SLICE_ANGLE);
}

export interface SpinPlan {
  /** Rotação final (acumulada, sempre maior que a atual). */
  target: number;
  durationMs: number;
}

/**
 * Planeja o giro: algumas voltas completas e parada dentro da fatia sorteada,
 * com um deslocamento aleatório para não parar sempre no meio.
 * @param jitter entre -1 e 1 (fração da meia-fatia usada, até 70%)
 */
export function planSpin(
  current: number,
  index: number,
  opts: { turns?: number; jitter?: number; reducedMotion?: boolean; durationMs?: number } = {},
): SpinPlan {
  const turns = opts.reducedMotion ? 1 : (opts.turns ?? 5);
  const jitter = Math.max(-1, Math.min(1, opts.jitter ?? 0));
  const stopAt = restingRotation(index) + jitter * (SLICE_ANGLE / 2) * 0.7;
  const delta = mod(stopAt - current, 360);
  return {
    target: current + turns * 360 + delta,
    durationMs: opts.reducedMotion ? 600 : (opts.durationMs ?? 3600),
  };
}

/** Ponto (x, y) num círculo de raio r centrado em (cx, cy), para um ângulo a partir do topo. */
export function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Caminho SVG da fatia i (setor de anel entre r0 e r1). */
export function slicePath(cx: number, cy: number, r0: number, r1: number, index: number): string {
  const a0 = index * SLICE_ANGLE;
  const a1 = (index + 1) * SLICE_ANGLE;
  const p0 = polar(cx, cy, r1, a0);
  const p1 = polar(cx, cy, r1, a1);
  const p2 = polar(cx, cy, r0, a1);
  const p3 = polar(cx, cy, r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  const f = (n: number) => n.toFixed(2);
  return [
    `M ${f(p0.x)} ${f(p0.y)}`,
    `A ${r1} ${r1} 0 ${large} 1 ${f(p1.x)} ${f(p1.y)}`,
    `L ${f(p2.x)} ${f(p2.y)}`,
    `A ${r0} ${r0} 0 ${large} 0 ${f(p3.x)} ${f(p3.y)}`,
    'Z',
  ].join(' ');
}
