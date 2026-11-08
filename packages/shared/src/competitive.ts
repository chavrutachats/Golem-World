/**
 * Regras do modo competitivo (roleta) acrescentadas na Fase 7: vidas e bots.
 */
import type { Difficulty } from './difficulty.js';

export const LIVES_RULES = {
  /** Vidas cheias. Cada erro (ou tempo esgotado) na roleta gasta uma. */
  max: 5,
  /** Uma vida volta a cada tantos minutos, até encher. */
  regenMinutes: 10,
} as const;

const REGEN_MS = LIVES_RULES.regenMinutes * 60_000;

export interface LivesState {
  lives: number;
  /** Momento a partir do qual a próxima vida conta (início do relógio de recarga). */
  updatedAt: Date;
  /** Quando volta a próxima vida (null com as vidas cheias). */
  nextLifeAt: Date | null;
}

/** Aplica a recarga até `now`: devolve as vidas de agora e o relógio ajustado. */
export function livesAt(stored: number, updatedAt: Date, now: Date): LivesState {
  const base = Math.min(LIVES_RULES.max, Math.max(0, Math.floor(stored)));
  if (base >= LIVES_RULES.max) return { lives: LIVES_RULES.max, updatedAt: now, nextLifeAt: null };
  const elapsed = Math.max(0, now.getTime() - updatedAt.getTime());
  const regained = Math.floor(elapsed / REGEN_MS);
  const lives = Math.min(LIVES_RULES.max, base + regained);
  if (lives >= LIVES_RULES.max) return { lives, updatedAt: now, nextLifeAt: null };
  const clock = new Date(updatedAt.getTime() + regained * REGEN_MS);
  return { lives, updatedAt: clock, nextLifeAt: new Date(clock.getTime() + REGEN_MS) };
}

/** Gasta uma vida (depois de aplicar a recarga). Com as vidas cheias, o relógio começa agora. */
export function spendLife(stored: number, updatedAt: Date, now: Date): LivesState {
  const current = livesAt(stored, updatedAt, now);
  if (current.lives <= 0) return current;
  const clock = current.lives >= LIVES_RULES.max ? now : current.updatedAt;
  const lives = current.lives - 1;
  return { lives, updatedAt: clock, nextLifeAt: new Date(clock.getTime() + REGEN_MS) };
}

/**
 * Ganha vidas (anúncio com prêmio ou recarga com shekels), sem passar do máximo. O
 * relógio de recarga segue de onde estava; com as vidas cheias, ele para.
 */
export function gainLives(stored: number, updatedAt: Date, now: Date, amount: number): LivesState {
  const current = livesAt(stored, updatedAt, now);
  const lives = Math.min(LIVES_RULES.max, current.lives + Math.max(0, Math.floor(amount)));
  if (lives >= LIVES_RULES.max) return { lives, updatedAt: now, nextLifeAt: null };
  return { lives, updatedAt: current.updatedAt, nextLifeAt: new Date(current.updatedAt.getTime() + REGEN_MS) };
}

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

export const BOT_RULES = {
  /** No modo aleatório, sem ninguém na fila por este tempo, um bot entra. */
  joinAfterSeconds: 8,
  /** Tempo que o bot "pensa" antes de jogar a vez. */
  thinkSeconds: { min: 3, max: 8 },
  /** Desempenho assumido para quem ainda não tem histórico. */
  defaultAccuracy: 0.6,
  /** O bot fica um pouco abaixo do jogador, para não virar um adversário imbatível. */
  handicap: 0.95,
  minAccuracy: 0.2,
  maxAccuracy: 0.88,
} as const;

/** Os bots são outros Golems, com nomes das sete espécies da Terra de Israel (Dt 8:8). */
export const BOT_NAMES = [
  'Golem Trigo',
  'Golem Cevada',
  'Golem Uva',
  'Golem Figo',
  'Golem Romã',
  'Golem Azeitona',
  'Golem Tâmara',
] as const;

const DIFFICULTY_SHIFT: Readonly<Record<Difficulty, number>> = { easy: 0.12, medium: 0, hard: -0.12, expert: -0.22 };

/**
 * Chance de o bot acertar uma pergunta: segue a taxa de acerto recente do adversário
 * humano (com um pequeno desconto), ajustada pela dificuldade da pergunta.
 */
export function botAccuracy(humanAccuracy: number | null, difficulty: Difficulty): number {
  const base = (humanAccuracy ?? BOT_RULES.defaultAccuracy) * BOT_RULES.handicap;
  const value = base + DIFFICULTY_SHIFT[difficulty];
  return Math.min(BOT_RULES.maxAccuracy, Math.max(BOT_RULES.minAccuracy, value));
}
