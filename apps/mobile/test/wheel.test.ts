import { describe, expect, it } from 'vitest';
import { WHEEL_SLICES } from '@trivia/shared';
import { mod, planSpin, polar, restingRotation, SLICE_ANGLE, SLICE_COUNT, sliceUnderPointer } from '../src/lib/wheel';
import { clockOffsetMs, displaySeconds, isUrgent, remainingMs } from '../src/lib/countdown';
import { initials, versionLine } from '../src/lib/copy';

describe('roleta', () => {
  it('tem uma fatia por categoria mais a Coroa', () => {
    expect(SLICE_COUNT).toBe(WHEEL_SLICES.length);
    expect(SLICE_ANGLE * SLICE_COUNT).toBeCloseTo(360);
  });

  it('a rotação de repouso deixa cada fatia sob o ponteiro', () => {
    for (let i = 0; i < SLICE_COUNT; i++) expect(sliceUnderPointer(restingRotation(i))).toBe(i);
  });

  it('o giro termina na fatia sorteada, para qualquer posição de partida e deslocamento', () => {
    for (const start of [0, 37, 359.9, 1234.5, -90]) {
      for (let i = 0; i < SLICE_COUNT; i++) {
        for (const jitter of [-1, -0.4, 0, 0.6, 1]) {
          const plan = planSpin(start, i, { jitter });
          expect(sliceUnderPointer(plan.target), `start=${start} i=${i} jitter=${jitter}`).toBe(i);
          expect(plan.target).toBeGreaterThan(start + 4 * 360);
        }
      }
    }
  });

  it('com movimento reduzido gira menos e mais rápido', () => {
    const plan = planSpin(0, 3, { reducedMotion: true });
    expect(plan.target).toBeLessThan(720);
    expect(plan.durationMs).toBeLessThan(1000);
    expect(sliceUnderPointer(plan.target)).toBe(3);
  });

  it('polar mede ângulos a partir do topo, no sentido horário', () => {
    const top = polar(100, 100, 50, 0);
    expect(top.x).toBeCloseTo(100);
    expect(top.y).toBeCloseTo(50);
    const right = polar(100, 100, 50, 90);
    expect(right.x).toBeCloseTo(150);
    expect(mod(-30, 360)).toBe(330);
  });
});

describe('cronômetro', () => {
  const deadline = '2026-10-29T12:00:30.000Z';

  it('compensa o relógio adiantado ou atrasado do celular', () => {
    // Celular 2 minutos atrasado: recebeu a pergunta às 11:58:00 locais, servidor dizia 12:00:00.
    const received = Date.parse('2026-10-29T11:58:00.000Z');
    const offset = clockOffsetMs('2026-10-29T12:00:00.000Z', received);
    expect(remainingMs(deadline, received, offset)).toBe(30_000);
    expect(remainingMs(deadline, received + 12_000, offset)).toBe(18_000);
    expect(remainingMs(deadline, received + 45_000, offset)).toBe(0);
  });

  it('exibe segundos arredondados para cima e marca os últimos 5', () => {
    expect(displaySeconds(29_001)).toBe(30);
    expect(displaySeconds(1)).toBe(1);
    expect(displaySeconds(0)).toBe(0);
    expect(isUrgent(4_000)).toBe(true);
    expect(isUrgent(0)).toBe(false);
    expect(isUrgent(9_000)).toBe(false);
  });
});

describe('textos', () => {
  it('monta a linha da versão com a licença em português', () => {
    expect(versionLine('en', 'The Holy Scriptures: A New Translation (JPS 1917)', 'Public Domain')).toBe(
      'Tradução inglesa: The Holy Scriptures: A New Translation (JPS 1917), domínio público.',
    );
    expect(versionLine('he', null, null)).toBeNull();
  });

  it('gera iniciais para o avatar', () => {
    expect(initials('Saymon Pires da Silva')).toBe('SS');
    expect(initials('Ana')).toBe('AN');
    expect(initials('  ')).toBe('?');
  });
});
