import { describe, expect, it } from 'vitest';
import { shade } from '../src/lib/color';
import { GRAVITY, makeParticles, particleAt, seeded } from '../src/lib/confetti';
import { pegsPassed, planSpin, SLICE_ANGLE, SLICE_COUNT } from '../src/lib/wheel';

describe('confete', () => {
  it('é previsível com a mesma semente e varia com outra', () => {
    const a = makeParticles(10, ['#fff'], 42);
    expect(makeParticles(10, ['#fff'], 42)).toEqual(a);
    expect(makeParticles(10, ['#fff'], 43)).not.toEqual(a);
    const r = seeded(1);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('sobe, cai com a gravidade e some no fim', () => {
    const [p] = makeParticles(1, ['#fff'], 7);
    expect(p!.vy).toBeLessThan(0);
    const start = particleAt(p!, 0);
    expect(Math.abs(start.x) + Math.abs(start.y)).toBe(0);
    expect(start.opacity).toBe(1);
    const peakT = -p!.vy / GRAVITY;
    expect(particleAt(p!, peakT).y).toBeLessThan(particleAt(p!, Math.min(1, peakT + 0.2)).y);
    expect(particleAt(p!, 1).opacity).toBe(0);
  });

  it('usa as cores em rodízio', () => {
    expect(makeParticles(4, ['a', 'b'], 1).map((p) => p.color)).toEqual(['a', 'b', 'a', 'b']);
  });
});

describe('roleta com peso', () => {
  it('conta um cravo a cada divisa de fatia que passa pelo ponteiro', () => {
    expect(pegsPassed(0)).toBe(0);
    expect(pegsPassed(SLICE_ANGLE - 0.1)).toBe(0);
    expect(pegsPassed(SLICE_ANGLE + 0.1)).toBe(1);
    expect(pegsPassed(360 * 5) - pegsPassed(0)).toBe(5 * SLICE_COUNT); // 5 voltas × 8 fatias
    expect(pegsPassed(-1)).toBe(-1); // o recuo antes de girar também conta
  });

  it('o giro de boas-vindas aceita outra duração', () => {
    expect(planSpin(0, 0, { turns: 1, durationMs: 1800 }).durationMs).toBe(1800);
    expect(planSpin(0, 0, { turns: 1, durationMs: 1800, reducedMotion: true }).durationMs).toBe(600);
  });
});

describe('cores', () => {
  it('escurece e clareia', () => {
    expect(shade('#808080', -0.5)).toBe('#404040');
    expect(shade('#000000', 0.5)).toBe('#808080');
    expect(shade('nada', 0.5)).toBe('nada');
  });
});
