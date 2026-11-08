import { describe, expect, it } from 'vitest';
import { anchorsFor, buildStudyDrafts, type JourneyBook } from '../src/journey/ingest-journey.js';
import { expandOtherRef, LinkIndex, parseCsvLine, torahLinkFromRow } from '../src/journey/links.js';
import { groupStudyTexts } from '../src/journey/generate-journey.js';

describe('conexões do Sefaria', () => {
  it('lê CSV com aspas e vírgulas dentro do campo', () => {
    expect(parseCsvLine('"Zohar, Bereshit 6:54",Genesis 1:1,,"Zohar, Bereshit",Kabbalah')).toEqual([
      'Zohar, Bereshit 6:54',
      'Genesis 1:1',
      '',
      'Zohar, Bereshit',
      'Kabbalah',
    ]);
    expect(parseCsvLine('a,"diz ""olá""",c')).toEqual(['a', 'diz "olá"', 'c']);
  });

  it('orienta a conexão da Torá para o outro texto e ignora o resto', () => {
    expect(torahLinkFromRow(['Mishnah Avot 5:1', 'Genesis 1:1', 'quotation', 'Mishnah Avot', 'Genesis', 'Mishnah', 'Tanakh'])).toEqual({
      torahRef: 'Genesis 1:1',
      otherRef: 'Mishnah Avot 5:1',
      otherText: 'Mishnah Avot',
      otherCategory: 'Mishnah',
    });
    expect(torahLinkFromRow(['Isaiah 1:1', 'Berakhot 2a:1', '', 'Isaiah', 'Berakhot', 'Tanakh', 'Talmud'])).toBeNull();
    expect(torahLinkFromRow(['Genesis 1:1', 'Exodus 20:8', '', 'Genesis', 'Exodus', 'Tanakh', 'Tanakh'])).toBeNull();
  });

  it('expande intervalos de segmentos e trata seção inteira como prefixo', () => {
    expect(expandOtherRef('Sanhedrin 38a:5-7').exact).toEqual(['Sanhedrin 38a:5', 'Sanhedrin 38a:6', 'Sanhedrin 38a:7']);
    expect(expandOtherRef('Bereshit Rabbah 8:1').exact).toEqual(['Bereshit Rabbah 8:1']);
    expect(expandOtherRef('Sanhedrin 38a').prefixes).toEqual(['Sanhedrin 38a:']);
    expect(expandOtherRef('Zohar, Bereshit 6:54').exact).toEqual(['Zohar, Bereshit 6:54']);
    const idx = new LinkIndex([
      { torahRef: 'Genesis 1:26', otherRef: 'Sanhedrin 38a:5-6', otherText: 'Sanhedrin', otherCategory: 'Talmud' },
      { torahRef: 'Genesis 2:7', otherRef: 'Sanhedrin 38b', otherText: 'Sanhedrin', otherCategory: 'Talmud' },
      { torahRef: 'Genesis 1:1', otherRef: 'Steinsaltz on Sanhedrin 38a:5', otherText: 'Steinsaltz on Sanhedrin', otherCategory: 'Talmud' },
    ]);
    expect(idx.anchorsFor('Sanhedrin 38a:6')).toEqual(['Genesis 1:26']);
    expect(idx.anchorsFor('Sanhedrin 38b:12')).toEqual(['Genesis 2:7']);
    expect(idx.anchorsFor('Sanhedrin 39a:1')).toEqual([]);
    expect(idx.baseTitles('Talmud')).toEqual(['Sanhedrin']);
  });
});

describe('textos de estudo', () => {
  const rashi: JourneyBook = { title: 'Rashi on Genesis', path: [], track: 'commentators', author: 'Rashi', anchorMode: 'structure', baseBook: 'Genesis' };
  const torah: JourneyBook = { title: 'Genesis', path: [], track: 'torah', author: null, anchorMode: 'self' };

  it('comentário se liga ao versículo comentado; introdução fica de fora', () => {
    expect(anchorsFor(rashi, { indices: [0, 0, 1], ref: 'Rashi on Genesis 1:1:2' }, null)).toEqual(['Genesis 1:1']);
    expect(anchorsFor(rashi, { indices: [5, 8, 0], ref: 'Rashi on Genesis 6:9:1' }, null)).toEqual(['Genesis 6:9']);
    expect(anchorsFor({ ...rashi, title: 'Ramban on Genesis' }, { indices: [0, 0], ref: 'Ramban on Genesis, Introduction 1' }, null)).toEqual([]);
  });

  it('cada segmento ganha as parashiot dos versículos (fronteira entre duas parashiot)', () => {
    const drafts = buildStudyDrafts(
      torah,
      [
        { indices: [5, 7], ref: 'Genesis 6:8', en: 'But Noah found grace.' },
        { indices: [5, 8], ref: 'Genesis 6:9', en: 'These are the generations of Noah.' },
      ],
      {},
      null,
    );
    expect(drafts.map((d) => d.parashot)).toEqual([['bereshit'], ['noach']]);
    expect(drafts[0]!.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('junta segmentos vizinhos em passagens para o motor de IA', () => {
    const base = {
      track: 'commentators' as const,
      bookTitle: 'Rashi on Genesis',
      author: 'Rashi',
      heText: null,
      heVersionTitle: null,
      heLicense: null,
      enText: 'texto',
      enVersionTitle: null,
      enLicense: null,
      ptText: null,
      ptVersionTitle: null,
      ptLicense: null,
      anchors: ['Genesis 1:1'],
      parashot: ['bereshit'],
      contentHash: 'x',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const rows = [0, 1, 2, 5].map((sequence) => ({ ...base, id: `id${sequence}`, ref: `Rashi on Genesis 1:1:${sequence + 1}`, sequence, wordCount: 30 }));
    const groups = groupStudyTexts(rows);
    expect(groups.map((g) => g.segments.length)).toEqual([3, 1]);
    expect(groups[0]!.category).toBe('torah');
    expect(groups[0]!.bookTitle).toBe('Rashi sobre Genesis');
  });
});
