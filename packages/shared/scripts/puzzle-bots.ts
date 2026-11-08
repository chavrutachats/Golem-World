/**
 * Robôs que jogam o "Pedras do Choshen", para medir a dificuldade das fases.
 *
 * - guloso: sempre a jogada que mais adianta os objetivos (um bom jogador sem visão de futuro);
 * - casual: metade das vezes a jogada do guloso, metade uma jogada válida qualquer (quem
 *   joga sem pensar muito). É ele que define a curva de dificuldade.
 *
 * As escolhas ao acaso saem de um gerador com semente: a mesma fase e a mesma semente
 * dão sempre a mesma partida. Assim, "quantas jogadas ele precisa para vencer" é um
 * número fixo por semente, e a taxa de vitória com N jogadas é a fração das sementes que
 * precisam de N ou menos.
 */
import { createPuzzle, goalProgress, playMove, type PuzzleLevel, type PuzzleMove, type PuzzleState } from '../src/puzzle/engine.js';

export const BOT_SKILL = { casual: 0.5, greedy: 1 } as const;

function value(s: PuzzleState): number {
  if (s.status === 'won') return 1e9;
  const left = goalProgress(s).reduce((sum, p) => sum + (p.goal.type === 'score' ? p.remaining / 40 : p.goal.type === 'clay' ? p.remaining * 3 : p.remaining * 1.5), 0);
  return -left + s.score / 200;
}

function xorshift(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

/** Uma partida do robô. Devolve o estado final (com a pontuação e as jogadas usadas). */
export function botPlay(level: PuzzleLevel, seed: number, skill: number): PuzzleState {
  let state = createPuzzle(level, seed);
  const r = xorshift(seed * 7919 + 13);
  while (state.status === 'playing') {
    const options: PuzzleState[] = [];
    for (let i = 0; i < level.rows; i++) {
      for (let c = 0; c < level.cols; c++) {
        for (const m of [[i, c, i, c + 1], [i, c, i + 1, c]] as PuzzleMove[]) {
          const res = playMove(state, m);
          if (res.ok) options.push(res.state);
        }
      }
    }
    if (options.length === 0) throw new Error('tabuleiro travado sem embaralhar');
    state = r() < skill ? options.reduce((a, b) => (value(b) > value(a) ? b : a)) : options[Math.floor(r() * options.length)]!;
  }
  return state;
}

/** As sementes de tabuleiro usadas na medição da fase n. */
export function botSeeds(n: number, count: number): number[] {
  return Array.from({ length: count }, (_, k) => 100_003 * k + n * 31 + 7);
}

/** O que a partida já tinha cumprido depois de cada jogada (índice 0 = antes da 1ª). */
export interface BotTrace {
  collected: number[][];
  clayLeft: number[];
  score: number[];
}

/**
 * Joga como botPlay, mas anota o progresso a cada jogada. Com os objetivos inflados (bem
 * maiores que os de verdade) e muitas jogadas, dá para saber de uma vez em que jogada o
 * robô cumpriria objetivos de qualquer tamanho menor: as escolhas dele quase não dependem
 * do tamanho do objetivo (o valor de cada jogada muda pelo mesmo tanto).
 */
export function botTrace(level: PuzzleLevel, seed: number, skill: number): BotTrace {
  let state = createPuzzle(level, seed);
  const r = xorshift(seed * 7919 + 13);
  const trace: BotTrace = { collected: [], clayLeft: [], score: [] };
  const note = (s: PuzzleState) => {
    trace.collected.push(s.collected.slice());
    trace.clayLeft.push(s.clay.reduce((sum, row) => sum + row.filter((hp) => hp > 0).length, 0));
    trace.score.push(s.score);
  };
  note(state);
  while (state.status === 'playing') {
    const options: PuzzleState[] = [];
    for (let i = 0; i < level.rows; i++) {
      for (let c = 0; c < level.cols; c++) {
        for (const m of [[i, c, i, c + 1], [i, c, i + 1, c]] as PuzzleMove[]) {
          const res = playMove(state, m);
          if (res.ok) options.push(res.state);
        }
      }
    }
    if (options.length === 0) throw new Error('tabuleiro travado sem embaralhar');
    state = r() < skill ? options.reduce((a, b) => (value(b) > value(a) ? b : a)) : options[Math.floor(r() * options.length)]!;
    note(state);
  }
  return trace;
}
