import { createPuzzle, playMove, puzzleLevel, findMove, type Board } from '@trivia/shared';
import { describe, expect, it } from 'vitest';
import { PUZZLE_TIMING, maxFall, planMove, planNudge, spawnRows } from '../src/lib/puzzle-frames';

describe('quadros da animação do puzzle', () => {
  const state = createPuzzle(puzzleLevel(4), 77);
  const move = findMove(state.board)!;
  const res = playMove(state, move);
  if (!res.ok) throw new Error(res.reason);

  it('troca, depois estouro e queda para cada cadeia, e termina no tabuleiro do motor', () => {
    const frames = planMove(state, res, false);
    expect(frames[0]!.board).toBe(res.afterSwap);
    expect(frames).toHaveLength(1 + res.steps.length * 2 + (res.endBonus ? 1 : 0) + (res.shuffled ? 1 : 0));
    const last = frames[frames.length - 1]!;
    expect(last.board).toEqual(res.shuffled ?? res.state.board);
    expect(last.score).toBe(res.state.score);
    // O estouro mostra exatamente as pedras que o motor tirou.
    expect(frames[1]!.popping).toBe(res.steps[0]!.cleared);
    for (const f of frames) expect(f.wait).toBeLessThanOrEqual(PUZZLE_TIMING.fallMax);
  });

  it('com movimento reduzido, tudo fica bem mais rápido', () => {
    const slow = planMove(state, res, false).reduce((s, f) => s + f.wait, 0);
    const fast = planMove(state, res, true).reduce((s, f) => s + f.wait, 0);
    expect(fast).toBeLessThan(slow / 2);
  });

  it('pedras novas caem de cima, empilhadas na ordem', () => {
    const step = res.steps[0]!;
    const spawns = spawnRows(step.afterClear, step.afterFall);
    expect(spawns.size).toBe(step.cleared.length);
    for (const [id, from] of spawns) {
      const row = step.afterFall.findIndex((r) => r.some((t) => t?.id === id));
      expect(from).toBeLessThan(0);
      expect(row - from).toBeGreaterThan(0);
    }
    expect(maxFall(step.afterClear, step.afterFall, spawns)).toBeGreaterThan(0);
  });

  it('troca que não vale: as pedras vão e voltam', () => {
    const board: Board = state.board;
    const frames = planNudge(state, [0, 0, 0, 1]);
    expect(frames).toHaveLength(2);
    expect(frames[0]!.board[0]![0]).toBe(board[0]![1]);
    expect(frames[1]!.board).toBe(board);
  });
});
