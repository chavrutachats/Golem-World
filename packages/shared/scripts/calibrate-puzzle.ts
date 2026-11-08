/**
 * Calibra as 60 fases do "Pedras do Choshen" (PUZZLE_TUNING em src/puzzle/levels.ts).
 *
 * 1. Para cada fase, o robô casual joga o desenho dela em SEEDS tabuleiros, com os
 *    objetivos inflados e muitas jogadas, anotando o progresso a cada jogada (botTrace).
 *    Daí sai, para qualquer tamanho de objetivo, em que jogada ele venceria cada tabuleiro.
 * 2. Fases com objetivo de coletar ou de pontos ficam com as jogadas de puzzleBudget(n) e
 *    recebem o maior objetivo com que o robô ainda vence na proporção de puzzleTarget(n).
 *    Fases só de barro (sem o que encolher) recebem as jogadas para isso.
 * 3. Conferência: com a tabela nova, os dois robôs jogam outros tabuleiros de verdade, e
 *    o script mostra quanto cada um vence por fase.
 *
 * Uso: pnpm --filter @trivia/shared calibrate-puzzle
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import type { PuzzleLayout } from '../src/puzzle/levels.js';
import { PUZZLE_LEVELS, puzzleBudget, puzzleLayout, puzzleTarget, withMoves } from '../src/puzzle/levels.js';
import { BOT_SKILL, botPlay, botSeeds, botTrace, type BotTrace } from './puzzle-bots.js';

const SEEDS = 240;
const CHECK_SEEDS = 120;
/** Objetivos inflados para a gravação (em %) e o teto de jogadas dela. */
const BIG = 260;
const CAP = 90;
const MIN_MOVES = 14;
const MAX_MOVES = 40;
const MIN_GOAL = 40;

interface Tuned {
  n: number;
  moves: number;
  goal: number;
  target: number;
  casual: number;
  greedy: number;
}

/** Em que jogada o robô cumpriria todos os objetivos de `layout` (Infinity = não cumpre). */
function neededAt(trace: BotTrace, layout: PuzzleLayout): number {
  let worst = 0;
  for (const goal of layout.goals) {
    let at = -1;
    for (let i = 0; i < trace.score.length; i++) {
      const ok =
        goal.type === 'collect' ? (trace.collected[i]![goal.kind] ?? 0) >= goal.count : goal.type === 'clay' ? trace.clayLeft[i] === 0 : trace.score[i]! >= goal.target;
      if (ok) {
        at = i;
        break;
      }
    }
    if (at < 0) return Infinity;
    worst = Math.max(worst, at);
  }
  return worst;
}

const rate = (needed: readonly number[], moves: number) => needed.filter((x) => x <= moves).length / needed.length;

function tune(n: number): { n: number; moves: number; goal: number } {
  const target = puzzleTarget(n);
  const big = puzzleLayout(n, BIG);
  const traces = botSeeds(n, SEEDS).map((seed) => botTrace(withMoves(big, CAP), seed, BOT_SKILL.casual));
  const scalable = big.goals.some((g) => g.type !== 'clay');
  const needed = (goal: number) => traces.map((tr) => neededAt(tr, puzzleLayout(n, goal)));
  const movesFor = (xs: readonly number[]) => {
    const sorted = [...xs].sort((a, b) => a - b);
    const q = sorted[Math.min(sorted.length - 1, Math.ceil(target * sorted.length) - 1)]!;
    return Math.min(MAX_MOVES, Math.max(MIN_MOVES, Number.isFinite(q) ? q : MAX_MOVES));
  };
  if (!scalable) return { n, moves: Math.max(movesFor(needed(100)), puzzleBudget(n) - 6), goal: 100 };
  const moves = puzzleBudget(n);
  // O maior objetivo que ainda deixa o robô vencer na proporção da curva.
  for (let goal = BIG; goal >= MIN_GOAL; goal -= 2) {
    if (rate(needed(goal), moves) >= target) return { n, moves, goal };
  }
  // Nem o menor objetivo basta (o barro pesa): mais jogadas.
  return { n, moves: movesFor(needed(MIN_GOAL)), goal: MIN_GOAL };
}

function check(n: number, moves: number, goal: number): Tuned {
  const level = withMoves(puzzleLayout(n, goal), moves);
  const seeds = Array.from({ length: CHECK_SEEDS }, (_, k) => 500_009 * k + n * 17 + 3);
  const wins = (skill: number) => seeds.filter((s) => botPlay(level, s, skill).status === 'won').length / CHECK_SEEDS;
  return { n, moves, goal, target: puzzleTarget(n), casual: wins(BOT_SKILL.casual), greedy: wins(BOT_SKILL.greedy) };
}

if (!isMainThread) {
  const { levels } = workerData as { levels: number[] };
  for (const n of levels) {
    const t = tune(n);
    parentPort!.postMessage(check(n, t.moves, t.goal));
  }
} else {
  const threads = Math.max(1, Math.min(cpus().length, 8));
  const all = Array.from({ length: PUZZLE_LEVELS }, (_, i) => i + 1);
  const results: Tuned[] = [];
  await Promise.all(
    Array.from({ length: threads }, (_, t) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { levels: all.filter((n) => n % threads === t) }, execArgv: process.execArgv });
      w.on('message', (r: Tuned) => {
        results.push(r);
        const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);
        process.stdout.write(`fase ${String(r.n).padStart(2)}: ${String(r.moves).padStart(2)} jogadas, objetivo ${String(r.goal).padStart(3)}% · casual ${pct(r.casual)} (alvo ${pct(r.target)}) · guloso ${pct(r.greedy)}\n`);
      });
      return new Promise<void>((resolve, reject) => {
        w.on('error', reject);
        w.on('exit', () => resolve());
      });
    }),
  );
  results.sort((a, b) => a.n - b.n);
  const file = fileURLToPath(new URL('../src/puzzle/levels.ts', import.meta.url));
  const rows: string[] = [];
  for (let i = 0; i < results.length; i += 6) rows.push('  ' + results.slice(i, i + 6).map((r) => `[${r.moves}, ${r.goal}]`).join(', ') + ',');
  const src = readFileSync(file, 'utf8');
  writeFileSync(file, src.replace(/(export const PUZZLE_TUNING[^\n]*= \[\n)[\s\S]*?(\n\];)/, `$1${rows.join('\n')}$2`));
  writeFileSync(fileURLToPath(new URL('./puzzle-curve.json', import.meta.url)), JSON.stringify(results, null, 1) + '\n');
  console.log(`\nPUZZLE_TUNING reescrito em ${file}`);
}
