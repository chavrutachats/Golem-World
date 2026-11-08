import { describe, expect, it } from 'vitest';
import { CALIBRATION_MIN_SAMPLES, recalibrateDifficulty } from '../src/difficulty.js';

describe('recalibrateDifficulty', () => {
  it('não mexe no nível com poucas respostas', () => {
    const r = recalibrateDifficulty('hard', { timesServed: CALIBRATION_MIN_SAMPLES - 1, timesCorrect: 29 });
    expect(r).toEqual({ difficulty: 'hard', changed: false, smoothedAccuracy: null });
  });

  it('mantém o nível quando o desempenho está dentro da faixa', () => {
    expect(recalibrateDifficulty('medium', { timesServed: 100, timesCorrect: 62 }).changed).toBe(false);
    expect(recalibrateDifficulty('easy', { timesServed: 40, timesCorrect: 40 }).difficulty).toBe('easy');
  });

  it('anda só um nível por vez, mesmo quando o alvo está longe', () => {
    // 90% de acerto numa pergunta rotulada "especialista": o alvo seria "fácil",
    // mas desce só para "difícil" nesta rodada.
    const r = recalibrateDifficulty('expert', { timesServed: 100, timesCorrect: 90 });
    expect(r.difficulty).toBe('hard');
    expect(r.changed).toBe(true);
  });

  it('sobe o nível quando quase ninguém acerta', () => {
    expect(recalibrateDifficulty('easy', { timesServed: 40, timesCorrect: 5 }).difficulty).toBe('medium');
  });

  it('é robusto a contadores inconsistentes', () => {
    const r = recalibrateDifficulty('medium', { timesServed: 50, timesCorrect: 999 });
    expect(r.smoothedAccuracy).toBeLessThanOrEqual(1);
  });
});
