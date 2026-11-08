/**
 * Regras do Golem World: quem abre o quê no mapa, como uma fase anda (corações,
 * obstáculos, tempo), a dificuldade dinâmica e as moedas.
 *
 * Funções puras: o servidor aplica, o app usa as mesmas para desenhar o mapa.
 */
import { DIFFICULTIES, type Difficulty } from '../difficulty.js';
import { PARASHOT, WORLDS, parashaById, parashotOfBook } from './parashot.js';
import { TORAH_BOOKS, isTorahBook, type TorahBook } from './refs.js';
import { JOURNEY_TRACKS, SUB_TRACKS, type JourneyTrack } from './tracks.js';

export const JOURNEY_RULES = {
  /** Corações no início de cada fase (itens podem somar). */
  hearts: 3,
  maxHearts: 6,
  questionTimeLimitSeconds: 25,
  networkGraceSeconds: 3,
  /** Obstáculos (perguntas a vencer) por tipo de fase. */
  obstacles: { main: 6, track: 5, beitMidrash: 8 },
  /** Resposta certa em até 35% do tempo é um pulo perfeito; depois de 75%, um pulo raspando. */
  perfectFraction: 0.35,
  slowFraction: 0.75,
  coins: {
    perfect: 3,
    pass: 2,
    slow: 1,
    complete: { main: 15, track: 10, beitMidrash: 50 },
    perStar: 5,
    /** Repetir uma fase já concluída rende esta fração do bônus de conclusão. */
    replayFactor: 0.5,
  },
  skill: {
    start: 0.6,
    min: 0,
    max: 3,
    delta: { perfect: 0.6, pass: 0.3, slow: 0.1, wrong: -0.5, timeout: -0.6, skipped: 0 },
  },
} as const;

// ---------------------------------------------------------------------------
// Nós do mapa
// ---------------------------------------------------------------------------

export type JourneyNode =
  | { kind: 'parasha'; parashaId: string; track: JourneyTrack }
  | { kind: 'beit-midrash'; book: TorahBook };

export type NodeKind = 'main' | 'track' | 'beitMidrash';

export function parashaNodeId(parashaId: string, track: JourneyTrack = 'torah'): string {
  return `${parashaId}:${track}`;
}

export function beitMidrashNodeId(book: TorahBook): string {
  return `beit-midrash:${book}`;
}

export function parseNodeId(id: string): JourneyNode | null {
  const [left, right, extra] = id.split(':');
  if (!left || !right || extra !== undefined) return null;
  if (left === 'beit-midrash') return isTorahBook(right) ? { kind: 'beit-midrash', book: right } : null;
  if (!parashaById(left) || !(JOURNEY_TRACKS as readonly string[]).includes(right)) return null;
  return { kind: 'parasha', parashaId: left, track: right as JourneyTrack };
}

export function nodeKind(node: JourneyNode): NodeKind {
  if (node.kind === 'beit-midrash') return 'beitMidrash';
  return node.track === 'torah' ? 'main' : 'track';
}

export type NodeState = 'locked' | 'open' | 'completed';

/** O que precisa estar concluído para abrir um nó (vazio = aberto desde o início). */
export function prerequisitesOf(node: JourneyNode): string[] {
  if (node.kind === 'beit-midrash') {
    return parashotOfBook(node.book).map((p) => parashaNodeId(p.id));
  }
  if (node.track !== 'torah') return [parashaNodeId(node.parashaId)];
  const parasha = parashaById(node.parashaId)!;
  if (parasha.number === 1) return [];
  const previous = PARASHOT[parasha.number - 2]!;
  if (previous.book !== parasha.book) return [beitMidrashNodeId(previous.book)];
  return [parashaNodeId(previous.id)];
}

export function nodeState(nodeId: string, completed: ReadonlySet<string>): NodeState {
  if (completed.has(nodeId)) return 'completed';
  const node = parseNodeId(nodeId);
  if (!node) return 'locked';
  return prerequisitesOf(node).every((p) => completed.has(p)) ? 'open' : 'locked';
}

/** Todos os nós do mapa, na ordem em que aparecem. */
export function allNodeIds(): string[] {
  const out: string[] = [];
  for (const book of TORAH_BOOKS) {
    for (const p of parashotOfBook(book)) {
      out.push(parashaNodeId(p.id));
      for (const t of SUB_TRACKS) out.push(parashaNodeId(p.id, t));
    }
    out.push(beitMidrashNodeId(book));
  }
  return out;
}

/** Nós que passam de "fechado" para "aberto" ao concluir `nodeId`. */
export function newlyOpened(nodeId: string, completedBefore: ReadonlySet<string>): string[] {
  const after = new Set(completedBefore);
  after.add(nodeId);
  return allNodeIds().filter((id) => nodeState(id, completedBefore) === 'locked' && nodeState(id, after) === 'open');
}

/** Próximo nó principal sugerido (onde o Golem fica parado no mapa). */
export function currentMainNode(completed: ReadonlySet<string>): string {
  for (const book of TORAH_BOOKS) {
    for (const p of parashotOfBook(book)) {
      const id = parashaNodeId(p.id);
      if (!completed.has(id)) return id;
    }
    const bm = beitMidrashNodeId(book);
    if (!completed.has(bm)) return bm;
  }
  return beitMidrashNodeId('Deuteronomy');
}

export function worldOfNode(node: JourneyNode): TorahBook {
  return node.kind === 'beit-midrash' ? node.book : parashaById(node.parashaId)!.book;
}

export function obstacleCount(node: JourneyNode): number {
  return JOURNEY_RULES.obstacles[nodeKind(node)];
}

// ---------------------------------------------------------------------------
// Dificuldade dinâmica
// ---------------------------------------------------------------------------

export type AnswerOutcome = 'perfect' | 'pass' | 'slow' | 'wrong' | 'timeout' | 'skipped';

export function classifyAnswer(input: { correct: boolean; timedOut: boolean; elapsedMs: number; limitMs: number }): AnswerOutcome {
  if (input.timedOut) return 'timeout';
  if (!input.correct) return 'wrong';
  const f = input.limitMs > 0 ? input.elapsedMs / input.limitMs : 1;
  if (f <= JOURNEY_RULES.perfectFraction) return 'perfect';
  if (f > JOURNEY_RULES.slowFraction) return 'slow';
  return 'pass';
}

export function passedObstacle(outcome: AnswerOutcome): boolean {
  return outcome === 'perfect' || outcome === 'pass' || outcome === 'slow' || outcome === 'skipped';
}

/**
 * Habilidade contínua de 0 a 3 (0 = Fácil … 3 = Especialista). Quanto mais rápido o
 * acerto, mais ela sobe; erro e tempo esgotado descem.
 */
export function nextSkill(skill: number, outcome: AnswerOutcome): number {
  const { min, max, delta } = JOURNEY_RULES.skill;
  const value = (Number.isFinite(skill) ? skill : JOURNEY_RULES.skill.start) + delta[outcome];
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

export function difficultyForSkill(skill: number): Difficulty {
  const idx = Math.min(DIFFICULTIES.length - 1, Math.max(0, Math.floor(skill + 0.5)));
  return DIFFICULTIES[idx]!;
}

/** Ordem de busca: o nível pedido, depois os vizinhos (mais perto primeiro, o mais fácil antes). */
export function difficultyNeighbors(target: Difficulty): Difficulty[] {
  const i = DIFFICULTIES.indexOf(target);
  return [...DIFFICULTIES].sort((a, b) => {
    const da = Math.abs(DIFFICULTIES.indexOf(a) - i);
    const db = Math.abs(DIFFICULTIES.indexOf(b) - i);
    return da - db || DIFFICULTIES.indexOf(a) - DIFFICULTIES.indexOf(b);
  });
}

// ---------------------------------------------------------------------------
// Estrelas e moedas
// ---------------------------------------------------------------------------

/** 3 estrelas sem perder coração, 2 com um coração perdido, 1 com mais. */
export function starsFor(heartsLost: number): 1 | 2 | 3 {
  if (heartsLost <= 0) return 3;
  if (heartsLost === 1) return 2;
  return 1;
}

export function answerCoins(outcome: AnswerOutcome, coinBonusPct: number): number {
  const base = outcome === 'perfect' || outcome === 'pass' || outcome === 'slow' ? JOURNEY_RULES.coins[outcome] : 0;
  return Math.round(base * (1 + coinBonusPct / 100));
}

export function completionCoins(kind: NodeKind, stars: number, firstTime: boolean, coinBonusPct: number): number {
  const base = JOURNEY_RULES.coins.complete[kind] + JOURNEY_RULES.coins.perStar * stars;
  const factor = firstTime ? 1 : JOURNEY_RULES.coins.replayFactor;
  return Math.round(base * factor * (1 + coinBonusPct / 100));
}

/** Uma parashá com todos os subcaminhos disponíveis concluídos. */
export function allTracksDone(parashaId: string, completed: ReadonlySet<string>, available: readonly JourneyTrack[]): boolean {
  const subs = available.filter((t) => t !== 'torah');
  return subs.length > 0 && subs.every((t) => completed.has(parashaNodeId(parashaId, t)));
}

export function worldTitle(book: TorahBook): string {
  const w = WORLDS.find((x) => x.id === book)!;
  return `Mundo ${w.number}: ${w.namePt}`;
}
