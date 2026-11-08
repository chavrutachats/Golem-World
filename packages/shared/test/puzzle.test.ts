import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOT_SKILL, botPlay } from '../scripts/puzzle-bots.js';
import {
  PUZZLE_CHAPTER_SIZE,
  PUZZLE_LEVELS,
  PUZZLE_TUNING,
  PUZZLE_RULES,
  PUZZLE_SCORE,
  PuzzleFinishRequestSchema,
  addMoves,
  createPuzzle,
  findMove,
  findRuns,
  goalProgress,
  nextInt,
  nextU32,
  playMove,
  puzzleCoins,
  puzzleLevel,
  puzzleStars,
  puzzleTarget,
  replay,
  seedFrom,
  type Board,
  type PuzzleLevel,
  type PuzzleMove,
  type PuzzleState,
  type Special,
  type Tile,
} from '../src/index.js';

/**
 * Monta um estado a partir de um desenho: dígito = cor, letras = especiais
 * (R = raio de linha, C = raio de coluna, B = estrondo, U = Urim; a cor vem depois:
 * "R1" ocupa uma casa). Casas separadas por espaço.
 */
function stateFrom(rows: string[], opts: Partial<PuzzleLevel> & { clay?: number[][]; moves?: number } = {}): PuzzleState {
  const grid = rows.map((line) => line.trim().split(/\s+/));
  let id = 1;
  const board: Board = grid.map((row) =>
    row.map((cell): Tile => {
      const sp: Record<string, Special> = { R: 'row', C: 'col', B: 'bomb', U: 'urim' };
      if (cell === 'U') return { id: id++, kind: -1, special: 'urim' };
      if (sp[cell[0]!]) return { id: id++, kind: Number(cell.slice(1)), special: sp[cell[0]!]! };
      return { id: id++, kind: Number(cell), special: null };
    }),
  );
  const r = grid.length;
  const c = grid[0]!.length;
  const level: PuzzleLevel = {
    level: 1,
    rows: r,
    cols: c,
    kinds: opts.kinds ?? 6,
    moves: opts.moves ?? 10,
    goals: opts.goals ?? [{ type: 'score', target: 1_000_000 }],
    clay: opts.clay ?? Array.from({ length: r }, () => new Array<number>(c).fill(0)),
    stars: [100, 200],
  };
  return { level, board, clay: level.clay.map((x) => x.slice()), rng: 42, nextId: id, score: 0, movesLeft: level.moves, movesUsed: 0, collected: [0, 0, 0, 0, 0, 0], status: 'playing' };
}

const ids = (b: Board) => b.flat().map((t) => t?.id);

/** Robô guloso: a jogada que mais adianta os objetivos. */
function greedyPlay(level: PuzzleLevel, seed: number): { state: PuzzleState; moves: PuzzleMove[] } {
  let state = createPuzzle(level, seed);
  const moves: PuzzleMove[] = [];
  const value = (s: PuzzleState) =>
    s.status === 'won'
      ? 1e9
      : -goalProgress(s).reduce((sum, p) => sum + (p.goal.type === 'score' ? p.remaining / 40 : p.goal.type === 'clay' ? p.remaining * 3 : p.remaining * 1.5), 0) + s.score / 200;
  while (state.status === 'playing') {
    let best: { m: PuzzleMove; s: PuzzleState } | null = null;
    for (let r = 0; r < level.rows; r++) {
      for (let c = 0; c < level.cols; c++) {
        for (const m of [[r, c, r, c + 1], [r, c, r + 1, c]] as PuzzleMove[]) {
          const res = playMove(state, m);
          if (res.ok && (!best || value(res.state) > value(best.s))) best = { m, s: res.state };
        }
      }
    }
    if (!best) throw new Error('tabuleiro travado sem embaralhar');
    moves.push(best.m);
    state = best.s;
  }
  return { state, moves };
}

describe('gerador pseudoaleatório', () => {
  it('a mesma semente dá a mesma sequência, com valores espalhados', () => {
    const a = { s: 7 };
    const b = { s: 7 };
    const xs = Array.from({ length: 1000 }, () => nextU32(a));
    expect(Array.from({ length: 1000 }, () => nextU32(b))).toEqual(xs);
    const counts = new Array(6).fill(0);
    const r = { s: 99 };
    for (let i = 0; i < 6000; i++) counts[nextInt(r, 6)]++;
    for (const n of counts) expect(n).toBeGreaterThan(850);
    expect(seedFrom('choshen:1')).toBe(seedFrom('choshen:1'));
    expect(seedFrom('choshen:1')).not.toBe(seedFrom('choshen:2'));
  });
});

describe('montagem do tabuleiro', () => {
  it('é determinística, começa sem trinca pronta e sempre com jogada', () => {
    for (const n of [1, 7, 23, 44, 60]) {
      const level = puzzleLevel(n);
      for (const seed of [1, 2, 3, 1234567]) {
        const a = createPuzzle(level, seed);
        expect(createPuzzle(level, seed)).toEqual(a);
        expect(findRuns(a.board)).toEqual([]);
        expect(findMove(a.board)).not.toBeNull();
        expect(a.board.flat().every((t) => t && t.kind >= 0 && t.kind < level.kinds)).toBe(true);
      }
    }
  });
});

describe('jogadas', () => {
  it('troca que não forma nada, longe ou fora do tabuleiro não vale e não gasta jogada', () => {
    const s = stateFrom(['0 1 2', '3 4 5', '0 1 2']);
    expect(playMove(s, [0, 0, 0, 1])).toEqual({ ok: false, reason: 'no-match' });
    expect(playMove(s, [0, 0, 1, 1])).toEqual({ ok: false, reason: 'not-adjacent' });
    expect(playMove(s, [0, 0, 0, 5])).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(playMove({ ...s, status: 'won' }, [0, 0, 1, 0])).toEqual({ ok: false, reason: 'over' });
  });

  it('trinca some, as pedras de cima caem (mesmas pedras) e novas descem do alto', () => {
    const s = stateFrom(['5 4 3', '1 0 2', '0 2 0'], { kinds: 3 });
    const before = s.board;
    const res = playMove(s, [1, 1, 2, 1]);
    if (!res.ok) throw new Error(res.reason);
    const [step] = res.steps;
    expect(step!.cleared.map((t) => [t.row, t.col])).toEqual([
      [2, 0],
      [2, 1],
      [2, 2],
    ]);
    expect(step!.scoreDelta).toBe(3 * PUZZLE_SCORE.perTile);
    // A pedra "4" (id da linha 0, coluna 1) caiu uma casa.
    const four = before[0]![1]!;
    expect(step!.afterFall[1]![1]!.id).toBe(four.id);
    // Três pedras novas no alto, com ids novos.
    expect(step!.afterFall[0]!.map((t) => t!.id).every((id) => id >= s.nextId)).toBe(true);
    expect(res.state.movesLeft).toBe(s.movesLeft - 1);
    expect(res.state.collected[0]).toBe(3);
  });

  it('4 em linha vira Raio onde o jogador soltou a pedra; L vira Estrondo; 5 vira Urim', () => {
    const four = stateFrom(['1 2 3 4 5', '0 0 1 0 2', '3 4 0 5 1']);
    const r4 = playMove(four, [2, 2, 1, 2]);
    if (!r4.ok) throw new Error(r4.reason);
    expect(r4.steps[0]!.created).toEqual([{ id: four.board[2]![2]!.id, row: 1, col: 2, special: 'row' }]);

    // T: a pedra solta no cruzamento completa a linha e a coluna.
    const tShape = stateFrom(['2 0 3', '4 0 5', '0 1 0', '3 0 4']);
    const rt = playMove(tShape, [2, 1, 3, 1]);
    if (!rt.ok) throw new Error(rt.reason);
    expect(rt.steps[0]!.created.map((c) => c.special)).toEqual(['bomb']);

    const five = stateFrom(['1 2 3 4 5', '0 0 1 0 0', '3 4 0 5 1']);
    const r5 = playMove(five, [2, 2, 1, 2]);
    if (!r5.ok) throw new Error(r5.reason);
    expect(r5.steps[0]!.created).toEqual([{ id: five.board[2]![2]!.id, row: 1, col: 2, special: 'urim' }]);
    expect(r5.steps[0]!.afterClear[1]![2]!.kind).toBe(-1);
  });

  it('Urim trocado com uma pedra limpa todas daquela cor', () => {
    const s = stateFrom(['2 1 2 3', '4 U 5 2', '2 3 4 1', '5 2 1 3']);
    const res = playMove(s, [1, 1, 1, 2]);
    if (!res.ok) throw new Error(res.reason);
    const cleared = res.steps[0]!.cleared;
    expect(cleared.filter((t) => t.kind === 5)).toHaveLength(2);
    expect(cleared.some((t) => t.special === 'urim')).toBe(true);
    expect(cleared.filter((t) => t.kind !== 5 && t.special !== 'urim')).toEqual([]);
  });

  it('Raio limpa a linha inteira; Raio + Raio limpa a cruz; Estrondo + Estrondo limpa 5×5', () => {
    const rowLine = stateFrom(['1 2 0 4 5', '2 R0 3 0 1', '3 4 5 1 2']);
    const rr = playMove(rowLine, [0, 2, 1, 2]);
    if (!rr.ok) throw new Error(rr.reason);
    expect(rr.steps[0]!.blasts).toEqual([{ row: 1, col: 1, special: 'row' }]);
    expect(new Set(rr.steps[0]!.cleared.filter((t) => t.row === 1).map((t) => t.col))).toEqual(new Set([0, 1, 2, 3, 4]));

    const cross = stateFrom(['1 2 3 4 5', '2 R1 C2 3 4', '3 4 5 1 2', '4 5 1 2 3', '5 1 2 3 4']);
    const rc = playMove(cross, [1, 1, 1, 2]);
    if (!rc.ok) throw new Error(rc.reason);
    const cells = new Set(rc.steps[0]!.cleared.map((t) => `${t.row},${t.col}`));
    for (let x = 0; x < 5; x++) expect(cells.has(`1,${x}`)).toBe(true);
    for (let y = 0; y < 5; y++) expect(cells.has(`${y},2`)).toBe(true);

    const bombs = stateFrom(['1 2 3 4 5 1', '2 3 4 5 1 2', '3 4 B1 B2 2 3', '4 5 1 2 3 4', '5 1 2 3 4 5', '1 2 3 4 5 1']);
    const rb = playMove(bombs, [2, 2, 2, 3]);
    if (!rb.ok) throw new Error(rb.reason);
    // 5×5 em volta de (2,3): linhas 0..4, colunas 1..5 = 25 casas.
    expect(rb.steps[0]!.cleared).toHaveLength(25);
  });

  it('pedra limpa racha o barro, uma camada por vez', () => {
    const clay = [
      [0, 0, 0],
      [0, 0, 0],
      [2, 1, 0],
    ];
    const s = stateFrom(['5 4 3', '1 0 2', '0 2 0'], { kinds: 3, clay, goals: [{ type: 'clay' }] });
    const res = playMove(s, [1, 1, 2, 1]);
    if (!res.ok) throw new Error(res.reason);
    expect(res.steps[0]!.clay[2]).toEqual([1, 0, 0]);
    expect(goalProgress(res.state)[0]!.remaining).toBeLessThanOrEqual(1);
  });

  it('passar de fase dá bônus pelas jogadas que sobram; acabar as jogadas perde; jogadas a mais reabrem', () => {
    const s = stateFrom(['5 4 3', '1 0 2', '0 2 0'], { kinds: 3, moves: 3, goals: [{ type: 'collect', kind: 0, count: 3 }] });
    const res = playMove(s, [1, 1, 2, 1]);
    if (!res.ok) throw new Error(res.reason);
    expect(res.state.status).toBe('won');
    expect(res.endBonus).toBe(2 * PUZZLE_SCORE.perMoveLeft);
    expect(puzzleStars(s.level, true, 150)).toBe(2);
    expect(puzzleStars(s.level, false, 9999)).toBe(0);

    const hard = stateFrom(['5 4 3', '1 0 2', '0 2 0'], { kinds: 3, moves: 1, goals: [{ type: 'collect', kind: 1, count: 99 }] });
    const lost = playMove(hard, [1, 1, 2, 1]);
    if (!lost.ok) throw new Error(lost.reason);
    expect(lost.state.status).toBe('lost');
    expect(playMove(lost.state, [0, 0, 0, 1])).toEqual({ ok: false, reason: 'over' });
    const more = addMoves(lost.state, PUZZLE_RULES.extraMoves);
    expect(more).toMatchObject({ status: 'playing', movesLeft: 5 });
  });

  it('o mesmo motor refaz a partida: o servidor chega ao mesmo resultado; jogada inventada é pega', () => {
    const level = puzzleLevel(9);
    const { state, moves } = greedyPlay(level, 2024);
    const again = replay(level, 2024, moves);
    expect(again.invalidAt).toBeNull();
    expect(again.state).toEqual(state);
    const forged = [...moves.slice(0, 3), [0, 0, 5, 5] as PuzzleMove, ...moves.slice(3)];
    expect(replay(level, 2024, forged).invalidAt).toBe(3);
    // Com outra semente, as mesmas jogadas não dão o mesmo resultado.
    expect(replay(level, 2025, moves).state.score).not.toBe(state.score);
  });
});

describe('fases', () => {
  it('as 60 fases são fixas e coerentes', () => {
    for (let n = 1; n <= PUZZLE_LEVELS; n++) {
      const lv = puzzleLevel(n);
      expect(puzzleLevel(n)).toEqual(lv);
      expect(lv.clay).toHaveLength(lv.rows);
      expect(lv.clay.every((row) => row.length === lv.cols)).toBe(true);
      expect(lv.stars[0]).toBeLessThan(lv.stars[1]);
      for (const g of lv.goals) {
        if (g.type === 'collect') expect(g.kind).toBeLessThan(lv.kinds);
        if (g.type === 'clay') expect(lv.clay.flat().some((hp) => hp > 0)).toBe(true);
      }
    }
    expect(() => puzzleLevel(0)).toThrow();
    expect(() => puzzleLevel(61)).toThrow();
  });

  it('nenhuma fase é impossível: o robô guloso passa de todas', { timeout: 60_000 }, () => {
    const failed: number[] = [];
    for (let n = 1; n <= PUZZLE_LEVELS; n++) {
      const level = puzzleLevel(n);
      const won = [11, 22, 33, 44, 55, 66].some((seed) => greedyPlay(level, seed * 1009 + n).state.status === 'won');
      if (!won) failed.push(n);
    }
    expect(failed).toEqual([]);
  });

  it('a dificuldade sobe aos poucos, sem degraus (curva medida na calibração)', () => {
    const curve = JSON.parse(readFileSync(new URL('../scripts/puzzle-curve.json', import.meta.url), 'utf8')) as {
      n: number;
      moves: number;
      goal: number;
      casual: number;
      greedy: number;
    }[];
    expect(curve).toHaveLength(PUZZLE_LEVELS);
    curve.forEach((c, i) => {
      // A medição é da tabela que está no código.
      expect([c.moves, c.goal]).toEqual(PUZZLE_TUNING[i]);
      expect(c.moves).toBeGreaterThanOrEqual(14);
      expect(c.moves).toBeLessThanOrEqual(40);
      // Bom jogador passa de quase todas.
      expect(c.greedy).toBeGreaterThanOrEqual(0.7);
      // Perto da curva-alvo.
      expect(Math.abs(c.casual - puzzleTarget(c.n))).toBeLessThanOrEqual(0.2);
    });
    // Nenhum tombo de uma fase para a seguinte dentro do capítulo.
    for (let i = 1; i < curve.length; i++) {
      if (i % PUZZLE_CHAPTER_SIZE === 0) continue;
      expect(curve[i - 1]!.casual - curve[i]!.casual).toBeLessThanOrEqual(0.2);
    }
    // Cada capítulo, na média, é mais difícil que o anterior.
    const mean = (ch: number) => curve.slice(ch * 10, ch * 10 + 10).reduce((sum, c) => sum + c.casual, 0) / 10;
    for (let ch = 1; ch < 6; ch++) expect(mean(ch)).toBeLessThan(mean(ch - 1));
    expect(mean(0)).toBeGreaterThan(0.9);
    expect(mean(5)).toBeGreaterThan(0.4);
    expect(mean(5)).toBeLessThan(0.7);
  });

  it('a medição confere com partidas de verdade (robô casual em tabuleiros novos)', { timeout: 60_000 }, () => {
    for (const n of [1, 12, 25, 38, 47, 60]) {
      const level = puzzleLevel(n);
      const seeds = Array.from({ length: 30 }, (_, k) => 900_001 * k + n * 13 + 5);
      const won = seeds.filter((s) => botPlay(level, s, BOT_SKILL.casual).status === 'won').length / seeds.length;
      expect(Math.abs(won - puzzleTarget(n)), `fase ${n}: ${won}`).toBeLessThanOrEqual(0.22);
    }
  });
});

describe('prêmios', () => {
  it('moedas só pelas estrelas novas', () => {
    expect(puzzleCoins(0, 3)).toBe(3 * PUZZLE_RULES.coinsPerStar);
    expect(puzzleCoins(2, 3)).toBe(PUZZLE_RULES.coinsPerStar);
    expect(puzzleCoins(3, 3)).toBe(0);
    expect(puzzleCoins(3, 1)).toBe(0);
  });

  it('o pedido de fim de partida só aceita jogadas no formato certo', () => {
    expect(PuzzleFinishRequestSchema.safeParse({ moves: [[0, 0, 0, 1]] }).success).toBe(true);
    expect(PuzzleFinishRequestSchema.safeParse({ moves: [[0, 0, 0]] }).success).toBe(false);
    expect(PuzzleFinishRequestSchema.safeParse({ moves: [[-1, 0, 0, 1]] }).success).toBe(false);
    expect(PuzzleFinishRequestSchema.safeParse({ moves: Array.from({ length: 81 }, () => [0, 0, 0, 1]) }).success).toBe(false);
  });
});
