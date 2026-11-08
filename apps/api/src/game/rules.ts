/**
 * Regras do jogo como funções puras sobre um retrato (snapshot) da partida.
 * Nada aqui toca banco, rede ou relógio: o serviço carrega o estado, aplica estas
 * funções e grava o resultado. Por isso estas regras têm cobertura total de testes.
 *
 * Regras (docs/GAME_RULES.md):
 *  - acertou: ganha os pontos do nível, avança a Coroa e gira de novo;
 *  - 3 acertos seguidos (ou cair na face Coroa do sevivon) enchem a Coroa: o jogador escolhe
 *    uma categoria sem selo e disputa o selo; acertou → selo (+25), errou → a vez passa;
 *  - cair na face Prêmio mostra o prêmio da rodada (anúncio opcional) e o jogador gira de novo;
 *  - errou ou esgotou o tempo: a Coroa zera e a vez passa (conta uma rodada);
 *  - vence quem completar os 6 selos; no limite de rodadas, mais selos, depois mais pontos.
 */
import {
  CATEGORY_IDS,
  CROWN_SLICE,
  DIFFICULTIES,
  DIFFICULTY_POINTS,
  GAME_RULES,
  PRIZE_SLICE,
  WHEEL_SLICES,
  type CategoryId,
  type Difficulty,
  type GameMode,
  type GamePhase,
  type GameStatus,
  type WheelSlice,
} from '@trivia/shared';

export interface Rng {
  int(maxExclusive: number): number;
}

export interface PlayerSnapshot {
  seat: number;
  seals: CategoryId[];
  crownProgress: number;
  score: number;
  correctCount: number;
  wrongCount: number;
}

export interface GameSnapshot {
  mode: GameMode;
  status: GameStatus;
  roundNumber: number;
  maxRounds: number;
  /** Assento da vez (null antes de começar ou depois do fim). */
  currentSeat: number | null;
  winnerSeat: number | null;
  players: PlayerSnapshot[];
}

function clone(game: GameSnapshot): GameSnapshot {
  return { ...game, players: game.players.map((p) => ({ ...p, seals: [...p.seals] })) };
}

function current(game: GameSnapshot): PlayerSnapshot {
  if (game.currentSeat === null) throw new Error('Partida sem jogador da vez.');
  const player = game.players.find((p) => p.seat === game.currentSeat);
  if (!player) throw new Error(`Assento ${game.currentSeat} não existe.`);
  return player;
}

export function isCrownFull(player: Pick<PlayerSnapshot, 'crownProgress'>): boolean {
  return player.crownProgress >= GAME_RULES.crownStreak;
}

// ---------------------------------------------------------------------------
// Sevivon
// ---------------------------------------------------------------------------

export interface DrawOptions {
  /** A face do Prêmio entra no sorteio (o app mostra anúncio e o prêmio da rodada ainda está de pé). */
  prize: boolean;
}

/**
 * Sorteia a face do sevivon entre as categorias que têm perguntas disponíveis, a Coroa e,
 * quando vale, o Prêmio, todas com o mesmo peso. Categorias sem perguntas e um Prêmio que
 * não daria para resgatar ficam de fora: o jogador nunca cai num beco sem saída.
 */
export function drawSlice(available: readonly CategoryId[], rng: Rng, opts: DrawOptions = { prize: false }): WheelSlice {
  const categories = CATEGORY_IDS.filter((c) => available.includes(c));
  if (categories.length === 0) throw new Error('Nenhuma categoria com perguntas disponíveis.');
  const slices: WheelSlice[] = [...categories, CROWN_SLICE, ...(opts.prize ? [PRIZE_SLICE] : [])];
  return slices[rng.int(slices.length)]!;
}

/** Faces que não pedem pergunta: o giro já nasce "usado". */
export function sliceNeedsQuestion(slice: WheelSlice): boolean {
  return slice !== CROWN_SLICE && slice !== PRIZE_SLICE;
}

export function sliceIndexOf(slice: WheelSlice): number {
  return WHEEL_SLICES.indexOf(slice);
}

/** Cair na face Coroa equivale a ter a Coroa cheia; o Prêmio não mexe na partida. */
export function applySpin(game: GameSnapshot, slice: WheelSlice): GameSnapshot {
  const next = clone(game);
  if (slice === CROWN_SLICE) current(next).crownProgress = GAME_RULES.crownStreak;
  return next;
}

/** Categorias que o jogador da vez pode disputar com a Coroa (as que ainda não têm selo). */
export function crownChoices(game: GameSnapshot, available: readonly CategoryId[]): CategoryId[] {
  const player = current(game);
  return CATEGORY_IDS.filter((c) => !player.seals.includes(c) && available.includes(c));
}

// ---------------------------------------------------------------------------
// Resposta
// ---------------------------------------------------------------------------

export interface AnswerInput {
  correct: boolean;
  isCrownChallenge: boolean;
  category: CategoryId;
  difficulty: Difficulty;
}

export interface AnswerOutcome {
  points: number;
  sealEarned: CategoryId | null;
  crownProgress: number;
  crownReady: boolean;
  canSpinAgain: boolean;
  turnPassed: boolean;
  finished: boolean;
  winnerSeat: number | null;
}

function finishByRounds(game: GameSnapshot): void {
  game.status = 'finished';
  game.currentSeat = null;
  if (game.mode === 'solo') {
    game.winnerSeat = null;
    return;
  }
  const [a, b] = game.players;
  if (!a || !b) {
    game.winnerSeat = null;
    return;
  }
  const diff = a.seals.length - b.seals.length || a.score - b.score;
  game.winnerSeat = diff > 0 ? a.seat : diff < 0 ? b.seat : null;
}

/** Passa a vez (no solo, a "vez" volta para o mesmo jogador) e conta a rodada. */
function passTurn(game: GameSnapshot): void {
  const seats = game.players.map((p) => p.seat).sort((x, y) => x - y);
  if (game.mode !== 'solo' && seats.length > 1) {
    const i = seats.indexOf(game.currentSeat!);
    game.currentSeat = seats[(i + 1) % seats.length]!;
  }
  game.roundNumber += 1;
  if (game.roundNumber > game.maxRounds) finishByRounds(game);
}

export function applyAnswer(game: GameSnapshot, input: AnswerInput): { game: GameSnapshot; outcome: AnswerOutcome } {
  if (game.status !== 'active') throw new Error('Partida não está ativa.');
  const next = clone(game);
  const player = current(next);
  let points = 0;
  let sealEarned: CategoryId | null = null;
  let turnPassed = false;

  if (input.correct) {
    player.correctCount += 1;
    points = DIFFICULTY_POINTS[input.difficulty];
    if (input.isCrownChallenge) {
      player.crownProgress = 0;
      if (!player.seals.includes(input.category)) {
        player.seals.push(input.category);
        sealEarned = input.category;
        points += GAME_RULES.sealBonusPoints;
      }
      if (player.seals.length >= GAME_RULES.sealsToWin) {
        next.status = 'finished';
        next.winnerSeat = player.seat;
        next.currentSeat = null;
      }
    } else {
      player.crownProgress = Math.min(player.crownProgress + 1, GAME_RULES.crownStreak);
    }
  } else {
    player.wrongCount += 1;
    player.crownProgress = 0;
    passTurn(next);
    turnPassed = true;
  }
  player.score += points;

  const finished = next.status === 'finished';
  const crownReady = !finished && !turnPassed && isCrownFull(player);
  return {
    game: next,
    outcome: {
      points,
      sealEarned,
      crownProgress: player.crownProgress,
      crownReady,
      canSpinAgain: !finished && !turnPassed && !crownReady,
      turnPassed: turnPassed && !finished,
      finished,
      winnerSeat: next.winnerSeat,
    },
  };
}

/** Desistência ou W.O. por tempo: o outro jogador vence (no solo, a partida é abandonada). */
export function forfeit(game: GameSnapshot, loserSeat: number): GameSnapshot {
  const next = clone(game);
  next.currentSeat = null;
  if (next.mode === 'solo' || next.players.length < 2) {
    next.status = 'abandoned';
    next.winnerSeat = null;
  } else {
    next.status = 'finished';
    next.winnerSeat = next.players.find((p) => p.seat !== loserSeat)!.seat;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Fase e tempo
// ---------------------------------------------------------------------------

export function computePhase(input: {
  status: GameStatus;
  isMyTurn: boolean;
  crownFull: boolean;
  hasPendingSpin: boolean;
  hasPendingPlay: boolean;
}): GamePhase {
  if (input.status === 'waiting_opponent') return 'waiting_opponent';
  if (input.status === 'finished' || input.status === 'abandoned') return 'finished';
  if (!input.isMyTurn) return 'opponent_turn';
  if (input.hasPendingPlay) return 'question';
  if (input.crownFull) return 'choose_crown';
  if (input.hasPendingSpin) return 'spun';
  return 'spin';
}

/** A resposta vale se chegar até o prazo mais a tolerância de rede. */
export function isPlayExpired(deadlineAt: Date, now: Date): boolean {
  return now.getTime() > deadlineAt.getTime() + GAME_RULES.networkGraceSeconds * 1000;
}

// ---------------------------------------------------------------------------
// Dificuldade
// ---------------------------------------------------------------------------

export type DifficultyWeights = Record<Difficulty, number>;

/**
 * Pesos do sorteio de dificuldade a partir da taxa de acerto recente do jogador
 * (null = jogador novo). A disputa de selo puxa para perguntas mais difíceis.
 */
export function difficultyWeights(accuracy: number | null, isCrownChallenge: boolean): DifficultyWeights {
  let w: DifficultyWeights;
  if (accuracy === null || accuracy < 0.5) w = { easy: 50, medium: 35, hard: 12, expert: 3 };
  else if (accuracy < 0.75) w = { easy: 30, medium: 40, hard: 22, expert: 8 };
  else w = { easy: 15, medium: 35, hard: 30, expert: 20 };
  if (isCrownChallenge) {
    w = { easy: Math.round(w.easy / 3), medium: w.medium, hard: w.hard + Math.round(w.easy / 3), expert: w.expert + Math.round(w.easy / 3) };
  }
  return w;
}

export function drawDifficulty(weights: DifficultyWeights, rng: Rng): Difficulty {
  const total = DIFFICULTIES.reduce((n, d) => n + weights[d], 0);
  let roll = rng.int(total);
  for (const d of DIFFICULTIES) {
    if (roll < weights[d]) return d;
    roll -= weights[d];
  }
  return 'medium';
}

/** Ordem de tentativa quando não há pergunta no nível sorteado: o próprio, depois os vizinhos. */
export function difficultyFallbackOrder(target: Difficulty): Difficulty[] {
  const i = DIFFICULTIES.indexOf(target);
  return [...DIFFICULTIES].sort((a, b) => {
    const da = Math.abs(DIFFICULTIES.indexOf(a) - i);
    const db = Math.abs(DIFFICULTIES.indexOf(b) - i);
    return da - db || DIFFICULTIES.indexOf(a) - DIFFICULTIES.indexOf(b);
  });
}

/** Embaralhamento das alternativas (Fisher-Yates): optionOrder[posição na tela] = índice canônico. */
export function shuffleOptions(count: number, rng: Rng): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}
