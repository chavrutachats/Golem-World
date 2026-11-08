/**
 * Gera os dados das Pedras do Choshen para o cliente Godot (Fase 16):
 * - apps/godot/data/puzzle.json: as 60 fases prontas (puzzleLevel) e as pedras;
 * - apps/godot/tests/puzzle_vectors.json: partidas de referência (jogadas e o estado depois
 *   de cada uma), para conferir que o motor em GDScript dá exatamente o mesmo resultado
 *   que o do servidor, que refaz cada partida para dar estrelas e moedas.
 *
 * Uso: pnpm --filter @trivia/mobile godot-puzzle-data
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogText, createPuzzle, playMove, PUZZLE_LEVELS, PUZZLE_SOURCE_REF, PUZZLE_STONES, puzzleLevel, puzzleStars, type Board, type PuzzleMove, type PuzzleState } from '@trivia/shared';

const levels = Array.from({ length: PUZZLE_LEVELS }, (_, i) => puzzleLevel(i + 1));
const data = {
  levels,
  stones: PUZZLE_STONES.map((s) => ({ id: s.id, name: { pt: s.name, en: catalogText(s.name, 'en'), he: s.he }, he: s.he })),
  sourceRef: PUZZLE_SOURCE_REF,
};
writeFileSync(fileURLToPath(new URL('../../godot/data/puzzle.json', import.meta.url)), JSON.stringify(data) + '\n');

const SPECIAL = { row: 'r', col: 'c', bomb: 'b', urim: 'u' } as const;
const boardText = (b: Board) => b.map((row) => row.map((t) => (t ? `${t.kind < 0 ? 'U' : t.kind}${t.special ? SPECIAL[t.special] : '-'}` : '..')).join('')).join('/');
const snapshot = (s: PuzzleState) => ({
  board: boardText(s.board),
  ids: s.board.flat().reduce((sum, t) => sum + (t ? t.id : 0), 0),
  clay: s.clay.flat().join(''),
  rng: s.rng,
  nextId: s.nextId,
  score: s.score,
  movesLeft: s.movesLeft,
  collected: [...s.collected],
  status: s.status,
});

/** Todas as trocas que valem, na ordem do tabuleiro. */
function validMoves(s: PuzzleState): PuzzleMove[] {
  const out: PuzzleMove[] = [];
  for (let r = 0; r < s.level.rows; r++) {
    for (let c = 0; c < s.level.cols; c++) {
      for (const m of [[r, c, r, c + 1], [r, c, r + 1, c]] as PuzzleMove[]) if (playMove(s, m).ok) out.push(m);
    }
  }
  return out;
}

const games: unknown[] = [];
for (const n of [1, 7, 12, 25, 31, 38, 47, 55, 60]) {
  for (const seed of [1234, 987654321, 42 + n]) {
    const level = levels[n - 1]!;
    let s = createPuzzle(level, seed);
    const start = snapshot(s);
    const moves: { move: PuzzleMove; steps: number; endBonus: number; shuffled: boolean; after: ReturnType<typeof snapshot> }[] = [];
    // Escolha determinística, variando a posição (para cair em especiais e combinações).
    for (let k = 0; s.status === 'playing' && k < 40; k++) {
      const valid = validMoves(s);
      if (!valid.length) break;
      const move = valid[(k * 7 + seed) % valid.length]!;
      const res = playMove(s, move);
      if (!res.ok) throw new Error('jogada recusada');
      s = res.state;
      moves.push({ move, steps: res.steps.length, endBonus: res.endBonus, shuffled: res.shuffled !== null, after: snapshot(s) });
    }
    games.push({ level: n, seed, start, moves, stars: puzzleStars(level, s.status === 'won', s.score) });
  }
}
// Partidas em que o tabuleiro trava e é embaralhado (raro no 8×8).
let found = 0;
for (let seed = 1; seed < 600 && found < 4; seed++) {
  // Tabuleiros pequenos com muitas cores (fases de teste) travam com frequência.
  const size = 4 + (seed % 2);
  const level = { level: 0, rows: size, cols: size, kinds: 6, moves: 40, goals: [{ type: 'score', target: 999999 }], clay: Array.from({ length: size }, () => new Array<number>(size).fill(0)), stars: [10, 20] } as unknown as (typeof levels)[number];
  let st = createPuzzle(level, seed * 7919);
  const start = snapshot(st);
  const moves = [];
  let shuffles = 0;
  for (let k = 0; st.status === 'playing' && k < 40; k++) {
    const valid = validMoves(st);
    if (!valid.length) break;
    const move = valid[(k * 5 + seed) % valid.length]!;
    const res = playMove(st, move);
    if (!res.ok) throw new Error('jogada recusada');
    st = res.state;
    if (res.shuffled) shuffles++;
    moves.push({ move, steps: res.steps.length, endBonus: res.endBonus, shuffled: res.shuffled !== null, after: snapshot(st) });
  }
  if (shuffles > 0) {
    games.push({ level: 0, levelData: level, seed: seed * 7919, start, moves, stars: puzzleStars(level, st.status === 'won', st.score) });
    found++;
  }
}
writeFileSync(fileURLToPath(new URL('../../godot/tests/puzzle_vectors.json', import.meta.url)), JSON.stringify({ games }) + '\n');
console.log(`${levels.length} fases; ${games.length} partidas de referência, ${games.reduce((n, g) => n + g.moves.length, 0)} jogadas`);
