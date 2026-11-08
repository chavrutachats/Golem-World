import { parashotOfBook, TORAH_BOOKS } from '@trivia/shared';
import { describe, expect, it } from 'vitest';
import { formatWait } from '../src/lib/lives';
import { goalOf, levelInfo, obstacleAt, stageAt, summarizeOpened } from '../src/lib/journey-level';
import { labelBox, layoutWorld, MAP_W, walkPoints } from '../src/lib/journey-map';

describe('mapa do Golem World', () => {
  it('põe todas as parashiot de cada livro e a casa de estudos no fim', () => {
    for (const book of TORAH_BOOKS) {
      const layout = layoutWorld(book);
      const parashot = parashotOfBook(book);
      expect(layout.nodes).toHaveLength(parashot.length + 1);
      expect(layout.nodes.at(-1)!.kind).toBe('beitMidrash');
      expect(layout.dots).toHaveLength(layout.nodes.length - 1);
      for (const n of layout.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(20);
        expect(n.x).toBeLessThanOrEqual(MAP_W - 20);
      }
      // As fases descem pelo mapa, sem se sobrepor.
      for (let i = 1; i < layout.nodes.length; i++) expect(layout.nodes[i]!.y).toBeGreaterThan(layout.nodes[i - 1]!.y + 20);
      expect(layout.height).toBeGreaterThan(layout.nodes.at(-1)!.y);
    }
  });

  it('é sempre o mesmo desenho (sorteio com semente)', () => {
    expect(layoutWorld('Genesis')).toEqual(layoutWorld('Genesis'));
  });

  it('não põe decoração em cima das fases, do caminho nem dos nomes', () => {
    const size = { w: 16, h: 16 };
    const layout = layoutWorld('Genesis', () => size);
    expect(layout.decor.length).toBeGreaterThan(5);
    for (const d of layout.decor) {
      const cx = d.x + size.w / 2;
      const cy = d.y + size.h / 2;
      for (const n of layout.nodes) {
        const min = (n.kind === 'beitMidrash' ? 34 : 15) + size.w / 2;
        expect(Math.hypot(n.x - cx, n.y - cy)).toBeGreaterThanOrEqual(min);
        const b = labelBox(n);
        expect(d.x < b.x1 && d.x + size.w > b.x0 && d.y < b.y1 && d.y + size.h > b.y0).toBe(false);
      }
    }
  });

  it('o Golem anda pelas pedrinhas, nos dois sentidos', () => {
    const layout = layoutWorld('Genesis');
    const fwd = walkPoints(layout, 0, 2);
    expect(fwd[0]).toEqual({ x: layout.nodes[0]!.x, y: layout.nodes[0]!.y });
    expect(fwd.at(-1)).toEqual({ x: layout.nodes[2]!.x, y: layout.nodes[2]!.y });
    expect(fwd.length).toBe(3 + layout.dots[0]!.length + layout.dots[1]!.length);
    const back = walkPoints(layout, 2, 0);
    expect(back).toEqual([...fwd].reverse());
    expect(walkPoints(layout, 1, 1)).toHaveLength(1);
    // Passos curtos: nada de teletransporte entre pedrinhas.
    for (let i = 1; i < fwd.length; i++) expect(Math.hypot(fwd[i]!.x - fwd[i - 1]!.x, fwd[i]!.y - fwd[i - 1]!.y)).toBeLessThan(16);
  });
});

describe('fases', () => {
  it('descreve a Torá, os caminhos e a casa de estudos', () => {
    expect(levelInfo('bereshit:torah')).toMatchObject({ kind: 'main', title: 'Bereshit', track: 'torah' });
    expect(levelInfo('bereshit:kabbalah')).toMatchObject({ kind: 'track', title: 'Bereshit: Cabalá' });
    expect(levelInfo('beit-midrash:Genesis')).toMatchObject({ kind: 'beitMidrash', book: 'Genesis' });
    expect(levelInfo('nada:torah')).toBeNull();
  });

  it('em Bereshit o cenário acompanha os dias da Criação', () => {
    const first = stageAt('bereshit:torah', 0, 6);
    const last = stageAt('bereshit:torah', 5, 6);
    expect(first.sky).toBe('void');
    expect(first.captionPt).toMatch(/Trevas/);
    expect(last.props).toContain('sun');
    // A Cabalá lê a parashá à noite, com estrelas.
    const zohar = stageAt('bereshit:kabbalah', 0, 5);
    expect(zohar.sky).toBe('night');
    expect(zohar.props).toContain('stars');
  });

  it('cada obstáculo é um episódio da parashá, com o versículo', () => {
    expect(obstacleAt('bereshit:torah', 3, 6)).toEqual({ obstacle: 'serpent', captionPt: expect.stringMatching(/serpente/), ref: 'Genesis 3:1' });
    // Mais obstáculos que episódios: a história anda sempre para a frente.
    const seq = [0, 1, 2, 3, 4, 5].map((i) => obstacleAt('bereshit:torah', i, 6).ref);
    expect(seq[0]).toBe('Genesis 1:2');
    expect(seq.at(-1)).toBe('Genesis 3:24');
    for (let i = 1; i < seq.length; i++) expect(seq.indexOf(seq[i]!)).toBeGreaterThanOrEqual(seq.indexOf(seq[i - 1]!));
    expect(obstacleAt('noach:midrash', 4, 5).obstacle).toBe('bricks');
    expect(obstacleAt('beit-midrash:Genesis', 0, 8).ref).toMatch(/^Genesis /);
  });

  it('a chegada da Torá é o episódio final; a do livro, a casa de estudos', () => {
    expect(goalOf('bereshit:torah')).toMatchObject({ model: { kind: 'prop', prop: 'candles' }, ref: 'Genesis 2:2' });
    expect(goalOf('beit-midrash:Genesis').model).toEqual({ kind: 'beitMidrash', style: 'yeshiva' });
    expect(goalOf('noach:midrash').model).toMatchObject({ kind: 'signpost' });
  });

  it('resume o que abriu no mapa', () => {
    expect(summarizeOpened(['bereshit:mishnah', 'bereshit:talmud', 'noach:torah'])).toEqual({
      tracks: ['mishnah', 'talmud'],
      nextMain: 'noach',
      beitMidrash: null,
    });
    expect(summarizeOpened(['beit-midrash:Genesis']).beitMidrash).toBe('Genesis');
  });
});

describe('vidas da roleta', () => {
  it('mostra o tempo até a próxima vida em minutos e segundos', () => {
    expect(formatWait(9 * 60_000 + 5_000)).toBe('9:05');
    expect(formatWait(400)).toBe('0:01');
    expect(formatWait(-10)).toBe('0:00');
  });
});

describe('cenas do mapa (Fase 12)', () => {
  it('uma cena entre cada par de parashiot, contando a parashá seguinte, longe das fases e dos enfeites', async () => {
    const { parashotOfBook, TORAH_BOOKS } = await import('@trivia/shared');
    const { layoutWorld, VIGNETTE_H, VIGNETTE_W, MAP_W } = await import('../src/lib/journey-map');
    for (const book of TORAH_BOOKS) {
      const layout = layoutWorld(book, () => ({ w: 10, h: 8 }), ['tree'], 60);
      const parashot = parashotOfBook(book);
      expect(layout.vignettes.map((v) => v.parashaId)).toEqual(parashot.slice(1).map((p) => p.id));
      for (const v of layout.vignettes) {
        expect(v.x).toBeGreaterThanOrEqual(VIGNETTE_W / 2 - 1);
        expect(v.x).toBeLessThanOrEqual(MAP_W - VIGNETTE_W / 2 + 1);
        for (const n of layout.nodes) expect(Math.hypot(n.x - v.x, n.y - v.y)).toBeGreaterThan(15);
        for (const d of layout.decor) {
          const overlap = Math.abs(d.x + 5 - v.x) < (VIGNETTE_W + 10) / 2 && Math.abs(d.y + 4 - v.y) < (VIGNETTE_H + 8) / 2;
          expect(overlap).toBe(false);
        }
      }
    }
  });
});
