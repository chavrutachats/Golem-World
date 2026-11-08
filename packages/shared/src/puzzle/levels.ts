/**
 * As 60 fases do "Pedras do Choshen", em 6 capítulos de 10 — um para cada pedra da
 * primeira e da segunda fileira do peitoral do Kohen Gadol (Shemot 28:17-18). Cada
 * capítulo destaca a sua pedra nos objetivos.
 *
 * As fases são fixas (geradas da mesma forma em todo aparelho a partir do número). Cada
 * uma tem duas partes:
 * - o desenho (puzzleLayout): cores no tabuleiro, tipos de objetivo e barro. As novidades
 *   entram uma de cada vez: 4 cores nas 5 primeiras fases, 5 até a 30 e 6 depois; barro
 *   em formas fáceis no começo, cruz e diagonais a partir do 2º capítulo, barro de duas
 *   camadas a partir do 4º, e as formas mais duras (fundo e cantos) só em fim de capítulo
 *   e só com 5 cores;
 * - o ajuste (PUZZLE_TUNING): as jogadas e o tamanho dos objetivos, calibrados por
 *   simulação para a dificuldade subir de forma gradual. Um robô "casual" (metade das
 *   jogadas boas, metade ao acaso) joga cada fase em 240 tabuleiros diferentes, e a fase
 *   fica do tamanho em que ele vence na proporção da curva-alvo (puzzleTarget: de 99% na
 *   fase 1 a cerca de 50% na 60; cada capítulo abre com uma fase mais leve e fecha com
 *   uma mais dura). Para refazer: pnpm --filter @trivia/shared calibrate-puzzle.
 *
 * Um teste joga cada fase com um robô guloso para garantir que nenhuma é impossível, e
 * outro confere que a curva não tem degraus.
 */
import type { PuzzleGoal, PuzzleLevel } from './engine.js';
import { nextInt, seedFrom } from './rng.js';

export const PUZZLE_LEVELS = 60;
export const PUZZLE_CHAPTER_SIZE = 10;

/** As pedras, na ordem do versículo (Shemot 28:17-18). */
export const PUZZLE_STONES = [
  { id: 'odem', name: 'Ódem', he: 'אודם' },
  { id: 'pitda', name: 'Pitdá', he: 'פטדה' },
  { id: 'bareket', name: 'Bareket', he: 'ברקת' },
  { id: 'nofech', name: 'Nófech', he: 'נופך' },
  { id: 'sapir', name: 'Sapir', he: 'ספיר' },
  { id: 'yahalom', name: 'Yahalom', he: 'יהלום' },
] as const satisfies readonly { id: string; name: string; he: string }[];

export type PuzzleStoneId = (typeof PUZZLE_STONES)[number]['id'];

/** Referência no Sefaria das pedras (para o link "de onde vem"). */
export const PUZZLE_SOURCE_REF = 'Exodus 28:17-18';

export function puzzleChapter(level: number): number {
  return Math.ceil(level / PUZZLE_CHAPTER_SIZE);
}

export type ClayShape = 'center' | 'border' | 'cross' | 'diagonals' | 'bottom' | 'checker' | 'top' | 'corners';

export function clayGrid(rows: number, cols: number, shape: ClayShape | null, hp: number): number[][] {
  const grid = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  if (!shape) return grid;
  const midR = (rows - 1) / 2;
  const midC = (cols - 1) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let on = false;
      switch (shape) {
        case 'center':
          on = Math.abs(r - midR) <= 1.5 && Math.abs(c - midC) <= 1.5;
          break;
        case 'border':
          on = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
          break;
        case 'cross':
          on = Math.abs(r - midR) <= 0.5 || Math.abs(c - midC) <= 0.5;
          break;
        case 'diagonals':
          on = Math.abs(r - c * ((rows - 1) / (cols - 1))) <= 0.6 || Math.abs(r - (cols - 1 - c) * ((rows - 1) / (cols - 1))) <= 0.6;
          break;
        case 'bottom':
          on = r >= rows - 2;
          break;
        case 'checker':
          on = Math.abs(r - midR) <= 2.5 && Math.abs(c - midC) <= 2 && (r + c) % 2 === 0;
          break;
        case 'top':
          on = r <= 1;
          break;
        case 'corners':
          on = (r <= 1 || r >= rows - 2) && (c <= 1 || c >= cols - 2);
          break;
      }
      if (on) grid[r]![c] = hp;
    }
  }
  return grid;
}

/**
 * Formas de barro, das mais fáceis às mais difíceis (medido com os robôs). Com 6 cores,
 * as formas que encostam nos cantos e no fundo pedem jogadas demais: ali só a cruz e o
 * barro de duas camadas nas formas fáceis.
 */
const SHAPES_EASY: readonly ClayShape[] = ['center', 'checker', 'top'];
const SHAPES_MEDIUM: readonly ClayShape[] = ['cross', 'diagonals'];
const SHAPES_HARD: readonly ClayShape[] = ['bottom', 'corners'];
/** As fáceis que aguentam barro de duas camadas (no alto, a 2ª camada fica longe demais das trincas). */
const SHAPES_TWO_LAYERS: readonly ClayShape[] = ['center', 'checker'];

/** O desenho da fase n: tudo menos as jogadas (e as estrelas, que dependem delas). */
export type PuzzleLayout = Omit<PuzzleLevel, 'moves' | 'stars'>;

/**
 * Ajuste de cada fase (índice 0 = fase 1): [jogadas, tamanho dos objetivos em %], saído
 * da calibração com a curva-alvo de puzzleTarget(). 100% = o tamanho de base do desenho.
 * Mudou o desenho das fases? Rode a calibração de novo.
 */
export const PUZZLE_TUNING: readonly (readonly [moves: number, goalPercent: number])[] = [
  [18, 260], [18, 260], [14, 100], [18, 260], [18, 260], [19, 100],
  [18, 130], [15, 100], [18, 174], [18, 126], [20, 260], [20, 162],
  [17, 100], [20, 184], [20, 216], [22, 100], [20, 152], [14, 100],
  [20, 182], [33, 40], [22, 260], [22, 180], [16, 100], [22, 204],
  [22, 206], [18, 100], [22, 174], [18, 100], [22, 212], [29, 40],
  [24, 156], [24, 110], [31, 100], [24, 110], [24, 114], [32, 100],
  [24, 96], [31, 100], [24, 104], [30, 40], [26, 174], [26, 120],
  [27, 100], [26, 120], [26, 130], [28, 100], [26, 98], [22, 100],
  [26, 110], [30, 40], [28, 192], [28, 120], [26, 100], [28, 124],
  [28, 122], [26, 100], [28, 102], [26, 100], [28, 110], [28, 94],
];

/**
 * Curva-alvo da calibração: a proporção de partidas que o robô casual vence na fase n.
 * Desce em linha reta de 97% a 52%; a 1ª fase de cada capítulo é um respiro (+5 pontos)
 * e a última, o desafio do capítulo (−5).
 */
export function puzzleTarget(n: number): number {
  const step = (n - 1) % PUZZLE_CHAPTER_SIZE;
  const base = 0.97 - 0.45 * ((n - 1) / (PUZZLE_LEVELS - 1));
  const bump = step === 0 ? 0.05 : step === PUZZLE_CHAPTER_SIZE - 1 ? -0.05 : 0;
  return Math.min(0.99, Math.max(0.45, base + bump));
}

/**
 * Jogadas de partida de cada fase antes da calibração: 18 no 1º capítulo, 2 a mais a cada
 * capítulo. Nas fases com objetivo de coletar ou de pontos, a calibração mantém essas
 * jogadas e acerta o tamanho do objetivo; nas de barro puro, acerta as jogadas.
 */
export function puzzleBudget(n: number): number {
  return 18 + 2 * (puzzleChapter(n) - 1);
}

/** Monta o desenho da fase n (1 a 60), com os objetivos no tamanho `goalPercent`. */
export function puzzleLayout(n: number, goalPercent = 100): PuzzleLayout {
  if (!Number.isInteger(n) || n < 1 || n > PUZZLE_LEVELS) throw new RangeError(`Fase inexistente: ${n}`);
  const rng = { s: seedFrom(`choshen:${n}`) };
  const chapter = puzzleChapter(n);
  const step = (n - 1) % PUZZLE_CHAPTER_SIZE; // 0..9 dentro do capítulo
  const d = (n - 1) / (PUZZLE_LEVELS - 1); // 0..1
  const k = goalPercent / 100;
  const rows = 8;
  const cols = n <= 6 ? 7 : 8;
  // Cada cor a mais deixa tudo bem mais difícil: a 5ª entra na fase 6 e a 6ª só na 31.
  const kinds = n <= 5 ? 4 : n <= 30 ? 5 : 6;
  const featured = Math.min(chapter - 1, kinds - 1);
  const others = () => {
    const pool = Array.from({ length: kinds }, (_, i) => i).filter((i) => i !== featured);
    return pool[nextInt(rng, pool.length)]!;
  };
  // Cada cor aparece menos com mais cores no tabuleiro: o objetivo acompanha.
  const per = (base: number) => Math.max(3, Math.round((base * 1.35 + 18 * d) * (5 / kinds) * k));
  const pick = (list: readonly ClayShape[]) => list[nextInt(rng, list.length)]!;

  let goals: PuzzleGoal[];
  let clay: ClayShape | null = null;
  let hp = 1;
  const six = kinds === 6;
  switch (step) {
    case 0:
      goals = [{ type: 'score', target: Math.max(300, Math.round(((1600 + 500 * d) * k) / 50) * 50) }];
      break;
    case 1:
      goals = [{ type: 'collect', kind: featured, count: per(16) }];
      break;
    case 2:
      hp = chapter >= 4 ? 2 : 1;
      clay = pick(hp === 2 ? SHAPES_TWO_LAYERS : SHAPES_EASY);
      goals = [{ type: 'clay' }];
      break;
    case 3: {
      const second = others();
      goals = [
        { type: 'collect', kind: featured, count: per(12) },
        { type: 'collect', kind: second, count: per(12) },
      ];
      break;
    }
    case 4:
      clay = pick(SHAPES_EASY);
      goals = [{ type: 'clay' }, { type: 'collect', kind: featured, count: per(12) }];
      break;
    case 5:
      clay = chapter === 1 ? pick(SHAPES_EASY) : six ? 'cross' : pick(SHAPES_MEDIUM);
      goals = [{ type: 'clay' }];
      break;
    case 6: {
      const second = others();
      goals = [
        { type: 'collect', kind: featured, count: per(16) },
        { type: 'collect', kind: second, count: per(16) },
      ];
      break;
    }
    case 7:
      // No 3º capítulo, cruz ou diagonais; do 4º em diante, duas camadas numa forma fácil.
      hp = chapter >= 4 ? 2 : 1;
      clay = chapter === 3 ? pick(SHAPES_MEDIUM) : pick(hp === 2 ? SHAPES_TWO_LAYERS : SHAPES_EASY);
      goals = [{ type: 'clay' }];
      break;
    case 8: {
      const pool = Array.from({ length: kinds }, (_, i) => i).filter((i) => i !== featured);
      const second = pool.splice(nextInt(rng, pool.length), 1)[0]!;
      const third = pool[nextInt(rng, pool.length)]!;
      goals = [
        { type: 'collect', kind: featured, count: per(12) },
        { type: 'collect', kind: second, count: per(12) },
        { type: 'collect', kind: third, count: per(12) },
      ];
      break;
    }
    default:
      // Fim de capítulo: a forma mais dura que o tabuleiro aguenta, com uma coleta junto.
      clay = chapter === 1 ? pick(SHAPES_EASY) : six ? 'cross' : pick(SHAPES_HARD);
      goals = [{ type: 'clay' }, { type: 'collect', kind: featured, count: per(18) }];
      break;
  }
  return { level: n, rows, cols, kinds, goals, clay: clayGrid(rows, cols, clay, hp) };
}

/** Junta o desenho com as jogadas; as estrelas acompanham as jogadas. */
export function withMoves(layout: PuzzleLayout, moves: number): PuzzleLevel {
  const twoStars = Math.round((moves * 95 + 500) / 50) * 50;
  const threeStars = Math.round((moves * 150 + 900) / 50) * 50;
  return { ...layout, moves, stars: [twoStars, threeStars] };
}

/** Monta a fase n (1 a 60). */
export function puzzleLevel(n: number): PuzzleLevel {
  const tuning = PUZZLE_TUNING[n - 1];
  if (!tuning) throw new RangeError(`Fase sem ajuste calibrado: ${n}`);
  return withMoves(puzzleLayout(n, tuning[1]), tuning[0]);
}
