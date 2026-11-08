/**
 * Quadros da animação do "Pedras do Choshen" (puro, testado sem tela): cada jogada do
 * motor vira a troca, o estouro, a queda e as pedras novas descendo, com os tempos.
 */
import type { Board, ClearedTile, MoveResult, PuzzleMove, PuzzleState, PuzzleStep } from '@trivia/shared';
import type { SoundName } from './sound';

export interface PuzzleFrame {
  board: Board;
  clay: readonly (readonly number[])[];
  /** Pedras estourando neste quadro. */
  popping: readonly ClearedTile[];
  blasts: PuzzleStep['blasts'];
  /** Pedras novas: linha (negativa) de onde começam a cair. */
  spawnFrom: ReadonlyMap<number, number>;
  /** Pontos já mostrados até este quadro. */
  score: number;
  /** Combinação em cadeia (para o "x2", "x3"). */
  cascade: number;
  wait: number;
  sound: SoundName | null;
}

export const PUZZLE_TIMING = {
  swap: 150,
  pop: 230,
  fallBase: 140,
  fallPerRow: 55,
  fallMax: 520,
  shuffle: 460,
  nudge: 130,
} as const;

const NO_SPAWN: ReadonlyMap<number, number> = new Map();

/** De onde as pedras novas caem: empilhadas acima do tabuleiro, na ordem certa. */
export function spawnRows(before: Board, after: Board): Map<number, number> {
  const known = new Set(before.flat().map((t) => t?.id));
  const out = new Map<number, number>();
  const cols = after[0]?.length ?? 0;
  for (let c = 0; c < cols; c++) {
    const fresh: { id: number; row: number }[] = [];
    for (let r = 0; r < after.length; r++) {
      const t = after[r]![c];
      if (t && !known.has(t.id)) fresh.push({ id: t.id, row: r });
    }
    for (const f of fresh) out.set(f.id, f.row - fresh.length);
  }
  return out;
}

/** Quantas linhas a pedra que mais cai percorre. */
export function maxFall(before: Board, after: Board, spawns: ReadonlyMap<number, number>): number {
  const rowOf = new Map<number, number>();
  before.forEach((row, r) => row.forEach((t) => t && rowOf.set(t.id, r)));
  let max = 0;
  after.forEach((row, r) =>
    row.forEach((t) => {
      if (!t) return;
      const from = rowOf.get(t.id) ?? spawns.get(t.id);
      if (from !== undefined) max = Math.max(max, r - from);
    }),
  );
  return max;
}

export function planMove(prev: PuzzleState, res: Extract<MoveResult, { ok: true }>, reducedMotion: boolean): PuzzleFrame[] {
  const k = reducedMotion ? 0.35 : 1;
  const frames: PuzzleFrame[] = [];
  let score = prev.score;
  let clay = prev.clay;
  frames.push({ board: res.afterSwap, clay, popping: [], blasts: [], spawnFrom: NO_SPAWN, score, cascade: 0, wait: PUZZLE_TIMING.swap * k, sound: 'dot' });
  for (const step of res.steps) {
    score += step.scoreDelta;
    clay = step.clay;
    const sound: SoundName = step.blasts.length ? 'bump' : step.created.length ? 'power' : step.cascade > 0 ? 'coin' : 'pop';
    frames.push({ board: step.afterClear, clay, popping: step.cleared, blasts: step.blasts, spawnFrom: NO_SPAWN, score, cascade: step.cascade, wait: PUZZLE_TIMING.pop * k, sound });
    const spawns = spawnRows(step.afterClear, step.afterFall);
    const fall = Math.min(PUZZLE_TIMING.fallMax, PUZZLE_TIMING.fallBase + maxFall(step.afterClear, step.afterFall, spawns) * PUZZLE_TIMING.fallPerRow);
    frames.push({ board: step.afterFall, clay, popping: [], blasts: [], spawnFrom: spawns, score, cascade: step.cascade, wait: fall * k, sound: null });
  }
  if (res.endBonus) {
    score += res.endBonus;
    frames.push({ ...frames[frames.length - 1]!, score, wait: 0, sound: null });
  }
  if (res.shuffled) frames.push({ board: res.shuffled, clay, popping: [], blasts: [], spawnFrom: NO_SPAWN, score, cascade: 0, wait: PUZZLE_TIMING.shuffle * k, sound: 'reveal' });
  return frames;
}

/** Troca que não forma nada: as pedras vão e voltam. */
export function planNudge(state: PuzzleState, move: PuzzleMove): PuzzleFrame[] {
  const [r1, c1, r2, c2] = move;
  const swapped = state.board.map((row) => row.slice());
  const a = swapped[r1]?.[c1];
  const b = swapped[r2]?.[c2];
  if (!a || !b) return [];
  swapped[r1]![c1] = b;
  swapped[r2]![c2] = a;
  const base = { clay: state.clay, popping: [], blasts: [], spawnFrom: NO_SPAWN, score: state.score, cascade: 0 };
  return [
    { ...base, board: swapped, wait: PUZZLE_TIMING.nudge, sound: 'bump' },
    { ...base, board: state.board, wait: PUZZLE_TIMING.nudge, sound: null },
  ];
}

export function restingFrame(state: PuzzleState): PuzzleFrame {
  return { board: state.board, clay: state.clay, popping: [], blasts: [], spawnFrom: NO_SPAWN, score: state.score, cascade: 0, wait: 0, sound: null };
}
