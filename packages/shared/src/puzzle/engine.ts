/**
 * Motor do "Pedras do Choshen" (match-3 do Golem World). Puro e determinístico: a mesma
 * semente e as mesmas jogadas dão sempre o mesmo tabuleiro, a mesma pontuação e o mesmo
 * resultado. O app usa para jogar e animar; o servidor usa para refazer a partida a
 * partir da lista de jogadas e só então dar estrelas e moedas.
 *
 * Regras:
 * - Troque duas pedras vizinhas para formar 3 ou mais iguais em linha ou coluna. Troca
 *   que não forma nada volta e não gasta jogada.
 * - 4 em linha → Raio (limpa a linha, ou a coluna, onde foi formado).
 *   L ou T → Estrondo (limpa o 3×3 em volta). 5 em linha → Urim (trocado com uma pedra,
 *   limpa todas daquela cor).
 * - Dois especiais trocados entre si combinam: Raio + Raio = cruz; Estrondo + Estrondo
 *   = 5×5; Raio + Estrondo = três linhas e três colunas; Urim + especial = todas as
 *   pedras daquela cor viram o especial e explodem; Urim + Urim = o tabuleiro inteiro.
 * - Pedra limpa em cima de barro racha o barro (uma camada por vez).
 * - Pedras caem, novas descem do alto, e combinações em cadeia valem mais.
 * - Sem jogada possível, o tabuleiro é embaralhado (sem gastar jogada).
 */
import { nextInt, type Rng } from './rng.js';

export const STONE_KINDS = 6;

export type Special = 'row' | 'col' | 'bomb' | 'urim';

export interface Tile {
  /** Identidade da pedra (para o app animar a mesma pedra caindo). */
  readonly id: number;
  /** Cor (0..5); o Urim não tem cor (-1). */
  readonly kind: number;
  readonly special: Special | null;
}

export type Board = readonly (readonly (Tile | null)[])[];
type MBoard = (Tile | null)[][];

export type PuzzleGoal = { type: 'collect'; kind: number; count: number } | { type: 'clay' } | { type: 'score'; target: number };

export interface PuzzleLevel {
  level: number;
  rows: number;
  cols: number;
  /** Quantas cores entram no tabuleiro (4 a 6). */
  kinds: number;
  moves: number;
  goals: readonly PuzzleGoal[];
  /** Camadas de barro por casa (0 a 2). */
  clay: readonly (readonly number[])[];
  /** Pontos para 2 e 3 estrelas (1 estrela = passar de fase). */
  stars: readonly [two: number, three: number];
}

export type PuzzleStatus = 'playing' | 'won' | 'lost';

export interface PuzzleState {
  readonly level: PuzzleLevel;
  readonly board: Board;
  readonly clay: readonly (readonly number[])[];
  readonly rng: number;
  readonly nextId: number;
  readonly score: number;
  readonly movesLeft: number;
  readonly movesUsed: number;
  /** Pedras limpas por cor. */
  readonly collected: readonly number[];
  readonly status: PuzzleStatus;
}

/** Jogada: [linha, coluna] de uma pedra e da vizinha. */
export type PuzzleMove = readonly [r1: number, c1: number, r2: number, c2: number];

export interface ClearedTile {
  id: number;
  row: number;
  col: number;
  kind: number;
  special: Special | null;
}

export interface PuzzleStep {
  /** Combinação em cadeia (0 = a da própria jogada). */
  cascade: number;
  cleared: ClearedTile[];
  /** Especiais que explodiram (para o efeito no app). */
  blasts: { row: number; col: number; special: Special }[];
  /** Especiais criados nesta etapa (a pedra fica no lugar e muda). */
  created: { id: number; row: number; col: number; special: Special }[];
  /** Tabuleiro depois de tirar as pedras, antes de cair. */
  afterClear: Board;
  clay: readonly (readonly number[])[];
  /** Tabuleiro depois de as pedras caírem e as novas descerem. */
  afterFall: Board;
  scoreDelta: number;
}

export type MoveResult =
  | { ok: true; state: PuzzleState; afterSwap: Board; steps: PuzzleStep[]; shuffled: Board | null; endBonus: number }
  | { ok: false; reason: 'over' | 'out-of-bounds' | 'not-adjacent' | 'empty' | 'no-match' };

export const PUZZLE_SCORE = {
  perTile: 10,
  perBlast: 20,
  perClay: 25,
  /** Cada jogada que sobra ao passar de fase. */
  perMoveLeft: 50,
} as const;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const copy = (b: Board): MBoard => b.map((row) => row.slice());
const freeze = (b: MBoard): Board => b.map((row) => row.slice());
const keyOf = (r: number, c: number) => r * 32 + c;
const rowOf = (k: number) => Math.floor(k / 32);
const colOf = (k: number) => k % 32;

function matchable(t: Tile | null | undefined): t is Tile {
  return !!t && t.kind >= 0;
}

/** Cor nova sem formar trinca com as duas pedras à esquerda ou acima (só na montagem). */
function pickKind(board: MBoard, r: number, c: number, kinds: number, rng: Rng): number {
  for (let tries = 0; tries < 12; tries++) {
    const k = nextInt(rng, kinds);
    const left = c >= 2 && board[r]![c - 1]?.kind === k && board[r]![c - 2]?.kind === k;
    const up = r >= 2 && board[r - 1]![c]?.kind === k && board[r - 2]![c]?.kind === k;
    if (!left && !up) return k;
  }
  // Sempre existe cor livre com 3 ou mais cores; o laço acima quase nunca chega aqui.
  for (let k = 0; k < kinds; k++) {
    const left = c >= 2 && board[r]![c - 1]?.kind === k && board[r]![c - 2]?.kind === k;
    const up = r >= 2 && board[r - 1]![c]?.kind === k && board[r - 2]![c]?.kind === k;
    if (!left && !up) return k;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Combinações no tabuleiro
// ---------------------------------------------------------------------------

interface Run {
  cells: number[];
  dir: 'h' | 'v';
  kind: number;
}

export function findRuns(board: Board): Run[] {
  const runs: Run[] = [];
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const t = board[r]![c];
      let end = c + 1;
      if (matchable(t)) while (end < cols && board[r]![end]?.kind === t.kind) end++;
      if (matchable(t) && end - c >= 3) runs.push({ cells: range(c, end).map((x) => keyOf(r, x)), dir: 'h', kind: t.kind });
      c = end;
    }
  }
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      const t = board[r]![c];
      let end = r + 1;
      if (matchable(t)) while (end < rows && board[end]![c]?.kind === t.kind) end++;
      if (matchable(t) && end - r >= 3) runs.push({ cells: range(r, end).map((y) => keyOf(y, c)), dir: 'v', kind: t.kind });
      r = end;
    }
  }
  return runs;
}

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a }, (_, i) => a + i);
}

interface Group {
  cells: Set<number>;
  runs: Run[];
  kind: number;
}

/** Junta trincas que dividem uma casa (L, T, cruz). */
function groupRuns(runs: Run[]): Group[] {
  const parent = runs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const owner = new Map<number, number>();
  runs.forEach((run, i) => {
    for (const cell of run.cells) {
      const j = owner.get(cell);
      if (j === undefined) owner.set(cell, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, Group>();
  runs.forEach((run, i) => {
    const root = find(i);
    const g = groups.get(root) ?? { cells: new Set<number>(), runs: [], kind: run.kind };
    run.cells.forEach((c) => g.cells.add(c));
    g.runs.push(run);
    groups.set(root, g);
  });
  // Ordem estável: pela primeira casa de cada grupo.
  return [...groups.values()].sort((a, b) => Math.min(...a.cells) - Math.min(...b.cells));
}

/** Que especial o grupo forma e onde ele nasce. */
function specialFor(group: Group, board: MBoard, prefer: readonly number[]): { cell: number; special: Special } | null {
  const longest = group.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
  const hasH = group.runs.some((r) => r.dir === 'h');
  const hasV = group.runs.some((r) => r.dir === 'v');
  let special: Special | null = null;
  if (longest.cells.length >= 5) special = 'urim';
  else if (hasH && hasV) special = 'bomb';
  else if (longest.cells.length === 4) special = longest.dir === 'h' ? 'row' : 'col';
  if (!special) return null;

  const free = (cell: number) => !board[rowOf(cell)]![colOf(cell)]?.special;
  // Onde o jogador mexeu; senão, a casa do meio da maior linha (ou o cruzamento do L/T).
  for (const cell of prefer) if (group.cells.has(cell) && free(cell)) return { cell, special };
  if (special === 'bomb') {
    const counts = new Map<number, number>();
    group.runs.forEach((r) => r.cells.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1)));
    const cross = [...counts.entries()].filter(([c, n]) => n > 1 && free(c)).map(([c]) => c).sort((a, b) => a - b)[0];
    if (cross !== undefined) return { cell: cross, special };
  }
  const mid = longest.cells[Math.floor((longest.cells.length - 1) / 2)]!;
  if (free(mid)) return { cell: mid, special };
  const any = [...group.cells].sort((a, b) => a - b).find(free);
  return any === undefined ? null : { cell: any, special };
}

/** Casas atingidas por um especial que explode em (r, c). */
function blastArea(board: MBoard, r: number, c: number, special: Special): number[] {
  const rows = board.length;
  const cols = board[0]!.length;
  const out: number[] = [];
  if (special === 'row') for (let x = 0; x < cols; x++) out.push(keyOf(r, x));
  if (special === 'col') for (let y = 0; y < rows; y++) out.push(keyOf(y, c));
  if (special === 'bomb') {
    for (let y = r - 1; y <= r + 1; y++) for (let x = c - 1; x <= c + 1; x++) if (y >= 0 && y < rows && x >= 0 && x < cols) out.push(keyOf(y, x));
  }
  if (special === 'urim') {
    // Urim atingido por outra explosão: limpa a cor mais comum do tabuleiro.
    const kind = commonestKind(board);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (board[y]![x]?.kind === kind) out.push(keyOf(y, x));
    out.push(keyOf(r, c));
  }
  return out;
}

function commonestKind(board: Board): number {
  const counts = new Array<number>(STONE_KINDS).fill(0);
  for (const row of board) for (const t of row) if (matchable(t)) counts[t.kind]!++;
  let best = 0;
  for (let k = 1; k < counts.length; k++) if (counts[k]! > counts[best]!) best = k;
  return best;
}

// ---------------------------------------------------------------------------
// Jogadas possíveis
// ---------------------------------------------------------------------------

function lineAt(board: Board, r: number, c: number): boolean {
  const t = board[r]?.[c];
  if (!matchable(t)) return false;
  const same = (y: number, x: number) => board[y]?.[x]?.kind === t.kind;
  let h = 1;
  for (let x = c - 1; same(r, x); x--) h++;
  for (let x = c + 1; same(r, x); x++) h++;
  if (h >= 3) return true;
  let v = 1;
  for (let y = r - 1; same(y, c); y--) v++;
  for (let y = r + 1; same(y, c); y++) v++;
  return v >= 3;
}

function swapValid(board: Board, r1: number, c1: number, r2: number, c2: number): boolean {
  const a = board[r1]?.[c1];
  const b = board[r2]?.[c2];
  if (!a || !b) return false;
  if (a.special === 'urim' || b.special === 'urim') return true;
  if (a.special && b.special) return true;
  const m = copy(board);
  m[r1]![c1] = b;
  m[r2]![c2] = a;
  return lineAt(m, r1, c1) || lineAt(m, r2, c2);
}

/** Uma jogada que vale (para a dica), ou null se o tabuleiro travou. */
export function findMove(board: Board): PuzzleMove | null {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols && swapValid(board, r, c, r, c + 1)) return [r, c, r, c + 1];
      if (r + 1 < rows && swapValid(board, r, c, r + 1, c)) return [r, c, r + 1, c];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

export function createPuzzle(level: PuzzleLevel, seed: number): PuzzleState {
  const rng: Rng = { s: seed | 0 };
  let nextId = 1;
  let board: MBoard = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    board = Array.from({ length: level.rows }, () => new Array<Tile | null>(level.cols).fill(null));
    for (let r = 0; r < level.rows; r++) {
      for (let c = 0; c < level.cols; c++) board[r]![c] = { id: nextId++, kind: pickKind(board, r, c, level.kinds, rng), special: null };
    }
    if (findMove(board)) break;
  }
  return {
    level,
    board: freeze(board),
    clay: level.clay.map((row) => row.slice()),
    rng: rng.s,
    nextId,
    score: 0,
    movesLeft: level.moves,
    movesUsed: 0,
    collected: new Array<number>(STONE_KINDS).fill(0),
    status: 'playing',
  };
}

// ---------------------------------------------------------------------------
// Objetivos
// ---------------------------------------------------------------------------

export interface GoalProgress {
  goal: PuzzleGoal;
  /** Quanto falta (0 = cumprido). */
  remaining: number;
}

export function goalProgress(state: Pick<PuzzleState, 'level' | 'collected' | 'clay' | 'score'>): GoalProgress[] {
  return state.level.goals.map((goal) => {
    switch (goal.type) {
      case 'collect':
        return { goal, remaining: Math.max(0, goal.count - (state.collected[goal.kind] ?? 0)) };
      case 'clay':
        return { goal, remaining: state.clay.reduce((sum, row) => sum + row.filter((hp) => hp > 0).length, 0) };
      case 'score':
        return { goal, remaining: Math.max(0, goal.target - state.score) };
    }
  });
}

export function goalsMet(state: Pick<PuzzleState, 'level' | 'collected' | 'clay' | 'score'>): boolean {
  return goalProgress(state).every((g) => g.remaining === 0);
}

/** Estrelas (0 = não passou). */
export function puzzleStars(level: PuzzleLevel, won: boolean, score: number): number {
  if (!won) return 0;
  return score >= level.stars[1] ? 3 : score >= level.stars[0] ? 2 : 1;
}

// ---------------------------------------------------------------------------
// A jogada
// ---------------------------------------------------------------------------

interface Work {
  board: MBoard;
  clay: number[][];
  rng: Rng;
  nextId: number;
  collected: number[];
  score: number;
}

/**
 * Tira as casas marcadas (e o que os especiais atingidos explodirem), cria os especiais
 * novos, racha o barro, faz cair e completa. Devolve a etapa para o app animar.
 */
function clearAndFall(
  w: Work,
  level: PuzzleLevel,
  cascade: number,
  initial: Iterable<number>,
  spawns: { cell: number; special: Special; kind: number }[],
  detonated: Set<number>,
  blasts: PuzzleStep['blasts'],
): PuzzleStep {
  const rows = level.rows;
  const cols = level.cols;
  const spawnAt = new Map(spawns.map((s) => [s.cell, s]));
  const marked = new Set<number>();
  const queue = [...initial];
  while (queue.length) {
    const cell = queue.shift()!;
    if (marked.has(cell)) continue;
    const r = rowOf(cell);
    const c = colOf(cell);
    const tile = w.board[r]?.[c];
    if (!tile) continue;
    marked.add(cell);
    // Especial atingido explode (uma vez), menos a pedra que acabou de virar especial.
    if (tile.special && !detonated.has(tile.id) && !spawnAt.has(cell)) {
      detonated.add(tile.id);
      blasts.push({ row: r, col: c, special: tile.special });
      queue.push(...blastArea(w.board, r, c, tile.special));
    }
  }

  const cleared: ClearedTile[] = [];
  const created: PuzzleStep['created'] = [];
  let tiles = 0;
  let clayHits = 0;
  for (const cell of [...marked].sort((a, b) => a - b)) {
    const r = rowOf(cell);
    const c = colOf(cell);
    const tile = w.board[r]![c]!;
    if (w.clay[r]![c]! > 0) {
      w.clay[r]![c]!--;
      clayHits++;
    }
    const spawn = spawnAt.get(cell);
    if (tile.kind >= 0) w.collected[tile.kind]!++;
    tiles++;
    if (spawn) {
      const next: Tile = { id: tile.id, kind: spawn.special === 'urim' ? -1 : spawn.kind, special: spawn.special };
      w.board[r]![c] = next;
      created.push({ id: tile.id, row: r, col: c, special: spawn.special });
    } else {
      cleared.push({ id: tile.id, row: r, col: c, kind: tile.kind, special: tile.special });
      w.board[r]![c] = null;
    }
  }
  const afterClear = freeze(w.board);
  const clay = w.clay.map((row) => row.slice());

  // Queda, coluna por coluna, e pedras novas do alto.
  for (let c = 0; c < cols; c++) {
    let write = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      const t = w.board[r]![c];
      if (t) {
        w.board[r]![c] = null;
        w.board[write]![c] = t;
        write--;
      }
    }
    for (let r = write; r >= 0; r--) w.board[r]![c] = { id: w.nextId++, kind: nextInt(w.rng, level.kinds), special: null };
  }

  const scoreDelta = tiles * PUZZLE_SCORE.perTile * (cascade + 1) + blasts.length * PUZZLE_SCORE.perBlast + clayHits * PUZZLE_SCORE.perClay;
  w.score += scoreDelta;
  return { cascade, cleared, blasts, created, afterClear, clay, afterFall: freeze(w.board), scoreDelta };
}

/** Combinações que se formaram sozinhas no tabuleiro, com os especiais que nascem delas. */
function matchesOf(board: MBoard, prefer: readonly number[]): { cells: number[]; spawns: { cell: number; special: Special; kind: number }[] } | null {
  const runs = findRuns(board);
  if (!runs.length) return null;
  const cells: number[] = [];
  const spawns: { cell: number; special: Special; kind: number }[] = [];
  for (const group of groupRuns(runs)) {
    cells.push(...group.cells);
    const s = specialFor(group, board, prefer);
    if (s) spawns.push({ ...s, kind: group.kind });
  }
  return { cells, spawns };
}

/** Efeito da troca de dois especiais (ou de um Urim com qualquer pedra). */
function comboCells(w: Work, a: { r: number; c: number; t: Tile }, b: { r: number; c: number; t: Tile }): number[] | null {
  const rows = w.board.length;
  const cols = w.board[0]!.length;
  const all = (pred: (t: Tile) => boolean) => {
    const out: number[] = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (w.board[y]![x] && pred(w.board[y]![x]!)) out.push(keyOf(y, x));
    return out;
  };
  const sa = a.t.special;
  const sb = b.t.special;
  if (sa === 'urim' && sb === 'urim') return all(() => true);
  if (sa === 'urim' || sb === 'urim') {
    const [urim, other] = sa === 'urim' ? [a, b] : [b, a];
    const kind = other.t.kind;
    if (other.t.special) {
      // Todas as pedras daquela cor viram o especial (raios alternam linha e coluna) e explodem.
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const t = w.board[y]![x];
          if (t && t.kind === kind && !t.special) {
            const special: Special = other.t.special === 'bomb' ? 'bomb' : (y + x) % 2 ? 'row' : 'col';
            w.board[y]![x] = { ...t, special };
          }
        }
      }
    }
    return [keyOf(urim.r, urim.c), ...all((t) => t.kind === kind)];
  }
  if (!sa || !sb) return null;
  const at = { r: b.r, c: b.c };
  const lines = (rs: number[], cs: number[]) => {
    const out: number[] = [];
    for (const y of rs) if (y >= 0 && y < rows) for (let x = 0; x < cols; x++) out.push(keyOf(y, x));
    for (const x of cs) if (x >= 0 && x < cols) for (let y = 0; y < rows; y++) out.push(keyOf(y, x));
    return out;
  };
  const isLine = (s: Special) => s === 'row' || s === 'col';
  if (isLine(sa) && isLine(sb)) return [keyOf(a.r, a.c), keyOf(b.r, b.c), ...lines([at.r], [at.c])];
  if (sa === 'bomb' && sb === 'bomb') {
    const out = [keyOf(a.r, a.c)];
    for (let y = at.r - 2; y <= at.r + 2; y++) for (let x = at.c - 2; x <= at.c + 2; x++) if (y >= 0 && y < rows && x >= 0 && x < cols) out.push(keyOf(y, x));
    return out;
  }
  return [keyOf(a.r, a.c), keyOf(b.r, b.c), ...lines([at.r - 1, at.r, at.r + 1], [at.c - 1, at.c, at.c + 1])];
}

/** Embaralha (sem gastar jogada) até haver jogada e nenhuma trinca pronta. */
function reshuffle(w: Work, level: PuzzleLevel): void {
  const cells: number[] = [];
  for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) if (w.board[r]![c] && !w.board[r]![c]!.special) cells.push(keyOf(r, c));
  for (let attempt = 0; attempt < 60; attempt++) {
    const tiles = cells.map((k) => w.board[rowOf(k)]![colOf(k)]!);
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = nextInt(w.rng, i + 1);
      [tiles[i], tiles[j]] = [tiles[j]!, tiles[i]!];
    }
    cells.forEach((k, i) => (w.board[rowOf(k)]![colOf(k)] = tiles[i]!));
    if (!findRuns(w.board).length && findMove(w.board)) return;
  }
  // Muito raro: recolore as pedras comuns (mesmas pedras, cores novas).
  for (let attempt = 0; attempt < 60; attempt++) {
    for (const k of cells) {
      const r = rowOf(k);
      const c = colOf(k);
      w.board[r]![c] = { ...w.board[r]![c]!, kind: pickKind(w.board, r, c, level.kinds, w.rng) };
    }
    if (!findRuns(w.board).length && findMove(w.board)) return;
  }
}

/** Faz uma jogada. Jogada que não vale não muda nada (nem gasta jogada). */
export function playMove(state: PuzzleState, move: PuzzleMove): MoveResult {
  if (state.status !== 'playing' || state.movesLeft <= 0) return { ok: false, reason: 'over' };
  const [r1, c1, r2, c2] = move;
  const { rows, cols } = state.level;
  const inside = (r: number, c: number) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < rows && c >= 0 && c < cols;
  if (!inside(r1, c1) || !inside(r2, c2)) return { ok: false, reason: 'out-of-bounds' };
  if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return { ok: false, reason: 'not-adjacent' };
  const a = state.board[r1]![c1];
  const b = state.board[r2]![c2];
  if (!a || !b) return { ok: false, reason: 'empty' };
  if (!swapValid(state.board, r1, c1, r2, c2)) return { ok: false, reason: 'no-match' };

  const w: Work = {
    board: copy(state.board),
    clay: state.clay.map((row) => row.slice()),
    rng: { s: state.rng },
    nextId: state.nextId,
    collected: state.collected.slice(),
    score: state.score,
  };
  w.board[r1]![c1] = b;
  w.board[r2]![c2] = a;
  const afterSwap = freeze(w.board);
  const steps: PuzzleStep[] = [];
  const detonated = new Set<number>();

  // Etapa 0: a combinação de especiais, ou as trincas que a troca formou.
  const combo = comboCells(w, { r: r1, c: c1, t: b }, { r: r2, c: c2, t: a });
  if (combo) {
    const blasts: PuzzleStep['blasts'] = [];
    for (const t of [a, b]) {
      if (t.special) {
        detonated.add(t.id);
        const at = t === a ? [r2, c2] : [r1, c1];
        blasts.push({ row: at[0]!, col: at[1]!, special: t.special });
      }
    }
    steps.push(clearAndFall(w, state.level, 0, combo, [], detonated, blasts));
  } else {
    // A pedra que o jogador arrastou (destino) tem preferência para virar especial.
    const found = matchesOf(w.board, [keyOf(r2, c2), keyOf(r1, c1)])!;
    steps.push(clearAndFall(w, state.level, 0, found.cells, found.spawns, detonated, []));
  }

  // Cadeias.
  for (let cascade = 1; cascade < 50; cascade++) {
    const found = matchesOf(w.board, []);
    if (!found) break;
    steps.push(clearAndFall(w, state.level, cascade, found.cells, found.spawns, detonated, []));
  }

  const movesLeft = state.movesLeft - 1;
  const partial = { level: state.level, collected: w.collected, clay: w.clay, score: w.score };
  const won = goalsMet(partial);
  let endBonus = 0;
  if (won) {
    endBonus = movesLeft * PUZZLE_SCORE.perMoveLeft;
    w.score += endBonus;
  }

  let shuffled: Board | null = null;
  if (!won && movesLeft > 0 && !findMove(w.board)) {
    reshuffle(w, state.level);
    shuffled = freeze(w.board);
  }

  return {
    ok: true,
    afterSwap,
    steps,
    shuffled,
    endBonus,
    state: {
      level: state.level,
      board: freeze(w.board),
      clay: w.clay,
      rng: w.rng.s,
      nextId: w.nextId,
      score: w.score,
      movesLeft,
      movesUsed: state.movesUsed + 1,
      collected: w.collected,
      status: won ? 'won' : movesLeft <= 0 ? 'lost' : 'playing',
    },
  };
}

/** Jogadas a mais (anúncio com prêmio quando as jogadas acabam). */
export function addMoves(state: PuzzleState, extra: number): PuzzleState {
  if (state.status === 'won' || extra <= 0) return state;
  return { ...state, movesLeft: state.movesLeft + extra, status: 'playing' };
}

export interface ReplayResult {
  state: PuzzleState;
  /** Índice da primeira jogada recusada (null = todas valeram). */
  invalidAt: number | null;
}

/** Refaz uma partida inteira (o servidor confere o resultado assim). */
export function replay(level: PuzzleLevel, seed: number, moves: readonly PuzzleMove[], extraMoves = 0): ReplayResult {
  let state = createPuzzle(level, seed);
  let extraGiven = false;
  for (let i = 0; i < moves.length; i++) {
    if (state.status === 'lost' && extraMoves > 0 && !extraGiven) {
      state = addMoves(state, extraMoves);
      extraGiven = true;
    }
    const res = playMove(state, moves[i]!);
    if (!res.ok) return { state, invalidAt: i };
    state = res.state;
  }
  return { state, invalidAt: null };
}
