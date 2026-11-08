import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS, GAME_RULES, WHEEL_SLICES, type CategoryId } from '@trivia/shared';
import {
  applyAnswer,
  applySpin,
  computePhase,
  crownChoices,
  difficultyFallbackOrder,
  difficultyWeights,
  drawDifficulty,
  drawSlice,
  forfeit,
  isPlayExpired,
  shuffleOptions,
  sliceIndexOf,
  sliceNeedsQuestion,
  type GameSnapshot,
  type Rng,
} from '../src/game/rules.js';

const seq = (...values: number[]): Rng => {
  let i = 0;
  return { int: (max) => values[i++ % values.length]! % max };
};

function duel(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    mode: 'random',
    status: 'active',
    roundNumber: 1,
    maxRounds: 25,
    currentSeat: 0,
    winnerSeat: null,
    players: [
      { seat: 0, seals: [], crownProgress: 0, score: 0, correctCount: 0, wrongCount: 0 },
      { seat: 1, seals: [], crownProgress: 0, score: 0, correctCount: 0, wrongCount: 0 },
    ],
    ...overrides,
  };
}

const ok = { correct: true, isCrownChallenge: false, category: 'torah' as CategoryId, difficulty: 'easy' as const };
const miss = { ...ok, correct: false };

describe('sevivon', () => {
  it('sorteia só entre categorias com perguntas e a Coroa', () => {
    const results = new Set(Array.from({ length: 3 }, (_, i) => drawSlice(['talmud', 'torah'], seq(i))));
    expect(results).toEqual(new Set(['torah', 'talmud', 'crown']));
  });

  it('o Prêmio só entra no sorteio quando pode ser resgatado', () => {
    const all = new Set(Array.from({ length: 8 }, (_, i) => drawSlice([...CATEGORY_IDS], seq(i), { prize: true })));
    expect(all).toEqual(new Set(WHEEL_SLICES));
    const without = new Set(Array.from({ length: 8 }, (_, i) => drawSlice([...CATEGORY_IDS], seq(i), { prize: false })));
    expect(without.has('prize')).toBe(false);
    expect(without.size).toBe(7);
  });

  it('falha se nenhuma categoria tiver perguntas, mesmo com Coroa e Prêmio', () => {
    expect(() => drawSlice([], seq(0))).toThrow();
    expect(() => drawSlice([], seq(0), { prize: true })).toThrow();
  });

  it('o índice da face é a posição em WHEEL_SLICES (6 categorias, Coroa, Prêmio)', () => {
    expect(WHEEL_SLICES).toHaveLength(8);
    expect(sliceIndexOf('torah')).toBe(0);
    expect(sliceIndexOf('crown')).toBe(6);
    expect(sliceIndexOf('prize')).toBe(7);
  });

  it('Coroa e Prêmio não pedem pergunta', () => {
    expect(sliceNeedsQuestion('crown')).toBe(false);
    expect(sliceNeedsQuestion('prize')).toBe(false);
    expect(CATEGORY_IDS.every(sliceNeedsQuestion)).toBe(true);
  });

  it('cair no Prêmio não mexe na partida', () => {
    expect(applySpin(duel(), 'prize')).toEqual(duel());
  });

  it('cair na Coroa enche a Coroa', () => {
    expect(applySpin(duel(), 'crown').players[0]!.crownProgress).toBe(GAME_RULES.crownStreak);
    expect(applySpin(duel(), 'mishnah').players[0]!.crownProgress).toBe(0);
  });
});

describe('respostas', () => {
  it('acerto soma pontos, avança a Coroa e permite girar de novo', () => {
    const { game, outcome } = applyAnswer(duel(), { ...ok, difficulty: 'hard' });
    expect(outcome).toMatchObject({ points: 35, crownProgress: 1, canSpinAgain: true, turnPassed: false, crownReady: false });
    expect(game.players[0]).toMatchObject({ score: 35, correctCount: 1 });
    expect(game.currentSeat).toBe(0);
  });

  it('o terceiro acerto seguido enche a Coroa e pede a escolha do selo', () => {
    let g = duel();
    g = applyAnswer(g, ok).game;
    g = applyAnswer(g, ok).game;
    const { outcome } = applyAnswer(g, ok);
    expect(outcome).toMatchObject({ crownReady: true, canSpinAgain: false, crownProgress: 3 });
  });

  it('erro zera a Coroa, passa a vez e conta a rodada', () => {
    const g = applyAnswer(duel(), ok).game;
    const { game, outcome } = applyAnswer(g, miss);
    expect(outcome).toMatchObject({ points: 0, turnPassed: true, canSpinAgain: false, crownProgress: 0 });
    expect(game).toMatchObject({ currentSeat: 1, roundNumber: 2 });
    expect(game.players[0]!.wrongCount).toBe(1);
  });

  it('no modo solo a vez volta para o mesmo jogador', () => {
    const solo = duel({ mode: 'solo', players: [duel().players[0]!] });
    const { game } = applyAnswer(solo, miss);
    expect(game).toMatchObject({ currentSeat: 0, roundNumber: 2, status: 'active' });
  });

  it('acertar a disputa da Coroa dá o selo, o bônus e zera a Coroa', () => {
    const g = applySpin(duel(), 'crown');
    const { game, outcome } = applyAnswer(g, { ...ok, isCrownChallenge: true, category: 'talmud', difficulty: 'medium' });
    expect(outcome).toMatchObject({ sealEarned: 'talmud', points: 20 + GAME_RULES.sealBonusPoints, crownProgress: 0, canSpinAgain: true });
    expect(game.players[0]!.seals).toEqual(['talmud']);
  });

  it('errar a disputa da Coroa não dá selo e passa a vez', () => {
    const g = applySpin(duel(), 'crown');
    const { game, outcome } = applyAnswer(g, { ...miss, isCrownChallenge: true, category: 'talmud' });
    expect(outcome).toMatchObject({ sealEarned: null, turnPassed: true });
    expect(game.players[0]!.seals).toEqual([]);
  });

  it('o sexto selo encerra a partida com vitória', () => {
    const g = duel();
    g.players[0]!.seals = ['torah', 'neviim_ketuvim', 'mishnah', 'talmud', 'halakhah'];
    g.players[0]!.crownProgress = 3;
    const { game, outcome } = applyAnswer(g, { ...ok, isCrownChallenge: true, category: 'midrash_aggadah' });
    expect(outcome).toMatchObject({ finished: true, winnerSeat: 0, canSpinAgain: false, crownReady: false });
    expect(game).toMatchObject({ status: 'finished', currentSeat: null });
  });

  it('no limite de rodadas vence quem tem mais selos; empate de selos vai para os pontos', () => {
    const g = duel({ roundNumber: 25, currentSeat: 0 });
    g.players[1]!.seals = ['torah'];
    const byseals = applyAnswer(g, miss);
    expect(byseals.outcome).toMatchObject({ finished: true, winnerSeat: 1, turnPassed: false });

    const h = duel({ roundNumber: 25 });
    h.players[0]!.score = 100;
    expect(applyAnswer(h, miss).outcome.winnerSeat).toBe(0);

    const tie = duel({ roundNumber: 25 });
    expect(applyAnswer(tie, miss).game).toMatchObject({ status: 'finished', winnerSeat: null });
  });

  it('não aceita resposta em partida encerrada', () => {
    expect(() => applyAnswer(duel({ status: 'finished' }), ok)).toThrow();
  });

  it('só oferece na Coroa categorias ainda sem selo e com perguntas', () => {
    const g = duel();
    g.players[0]!.seals = ['torah'];
    expect(crownChoices(g, ['torah', 'talmud', 'mishnah'])).toEqual(['mishnah', 'talmud']);
  });
});

describe('desistência e fases', () => {
  it('quem desiste perde; no solo a partida é abandonada', () => {
    expect(forfeit(duel(), 0)).toMatchObject({ status: 'finished', winnerSeat: 1 });
    expect(forfeit(duel({ mode: 'solo', players: [duel().players[0]!] }), 0)).toMatchObject({ status: 'abandoned', winnerSeat: null });
  });

  it('calcula a fase do ponto de vista de quem consulta', () => {
    const base = { status: 'active' as const, isMyTurn: true, crownFull: false, hasPendingSpin: false, hasPendingPlay: false };
    expect(computePhase(base)).toBe('spin');
    expect(computePhase({ ...base, hasPendingSpin: true })).toBe('spun');
    expect(computePhase({ ...base, hasPendingPlay: true })).toBe('question');
    expect(computePhase({ ...base, crownFull: true })).toBe('choose_crown');
    expect(computePhase({ ...base, isMyTurn: false })).toBe('opponent_turn');
    expect(computePhase({ ...base, status: 'waiting_opponent' })).toBe('waiting_opponent');
    expect(computePhase({ ...base, status: 'abandoned' })).toBe('finished');
  });

  it('aceita resposta até o prazo mais a tolerância de rede', () => {
    const deadline = new Date('2026-10-28T12:00:30Z');
    expect(isPlayExpired(deadline, new Date('2026-10-28T12:00:32Z'))).toBe(false);
    expect(isPlayExpired(deadline, new Date('2026-10-28T12:00:34Z'))).toBe(true);
  });
});

describe('dificuldade e embaralhamento', () => {
  it('jogador novo recebe mais perguntas fáceis; disputa de selo puxa para as difíceis', () => {
    const novo = difficultyWeights(null, false);
    expect(novo.easy).toBeGreaterThan(novo.expert);
    const coroa = difficultyWeights(null, true);
    expect(coroa.easy).toBeLessThan(novo.easy);
    expect(coroa.hard).toBeGreaterThan(novo.hard);
    expect(difficultyWeights(0.9, false).expert).toBeGreaterThan(novo.expert);
  });

  it('sorteia o nível respeitando os pesos', () => {
    const w = { easy: 1, medium: 0, hard: 0, expert: 0 };
    expect(drawDifficulty(w, seq(0))).toBe('easy');
    expect(drawDifficulty({ easy: 0, medium: 0, hard: 0, expert: 5 }, seq(4))).toBe('expert');
  });

  it('procura níveis vizinhos quando falta pergunta no sorteado', () => {
    expect(difficultyFallbackOrder('medium')).toEqual(['medium', 'easy', 'hard', 'expert']);
    expect(difficultyFallbackOrder('expert')).toEqual(['expert', 'hard', 'medium', 'easy']);
  });

  it('embaralha as alternativas numa permutação válida', () => {
    const order = shuffleOptions(4, seq(3, 1, 0));
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
  });
});
