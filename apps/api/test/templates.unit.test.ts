/**
 * Moldes de pergunta (sem banco): a resposta certa sai do próprio texto, as
 * alternativas são distintas e nenhum Nome divino vira lacuna ou alternativa.
 */
import { readFileSync } from 'node:fs';
import { DIFFICULTIES, LOCALES, normalizeForMatch, type Locale } from '@trivia/shared';
import { describe, expect, it } from 'vitest';
import {
  blankCandidates,
  buildTemplateQuestion,
  commentAuthor,
  completeVerse,
  excerpt,
  nextVerse,
  parashaOf,
  sourceVerse,
  whichFirst,
  type Rng,
  type StudySeg,
} from '../src/questions/templates.js';

const rows = (JSON.parse(readFileSync(new URL('./fixtures/journey-bereshit.json', import.meta.url), 'utf8')) as Omit<StudySeg, 'id' | 'ptText' | 'ptVersionTitle' | 'ptLicense'>[]).map(
  (r, i) => ({ ...r, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, ptText: null, ptVersionTitle: null, ptLicense: null }),
);
const verses = rows.filter((r) => r.track === 'torah');
const rashi = rows.filter((r) => r.track === 'commentators');
const mishnah = rows.filter((r) => r.track === 'mishnah');

function seeded(seed: number): Rng {
  let s = seed;
  return { int: (n) => ((s = (s * 1103515245 + 12345) % 2147483648), s % n) };
}

describe('lacunas', () => {
  it('nunca escolhe artigo, preposição ou Nome divino', () => {
    const words = blankCandidates('And God said: Let there be light; and the LORD saw Adam and Eve.', 'en').map((c) => c.word);
    expect(words).not.toContain('God');
    expect(words).not.toContain('LORD');
    expect(words).not.toContain('there');
    expect(words).toContain('light');
    expect(blankCandidates('E disse Deus: Haja luz. E viu o Eterno', 'pt').map((c) => c.word)).not.toContain('Deus');
    const he = blankCandidates('וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר וַיְהִי־אוֹר', 'he').map((c) => c.word);
    expect(he.some((w) => w.includes('אֱלֹהִים'))).toBe(false);
  });

  it('corta trechos longos com reticências', () => {
    expect(excerpt('um dois três quatro cinco', 3)).toBe('um dois três…');
    expect(excerpt('curto', 10)).toBe('curto');
  });
});

describe.each([1, 2, 3, 4, 5, 6, 7, 8])('moldes com a semente %i', (seed) => {
  const input = (difficulty: (typeof DIFFICULTIES)[number], segments = verses) => ({ verses, segments, parashaId: 'bereshit', difficulty, rng: seeded(seed), locale: 'en' as Locale });

  it('complete-verse: a palavra certa está no versículo e as erradas não', () => {
    for (const d of DIFFICULTIES) {
      const q = completeVerse(input(d));
      if (!q) continue;
      expect(new Set(q.options.map(normalizeForMatch)).size).toBe(4);
      const answer = q.options[q.correctIndex]!;
      expect(normalizeForMatch(q.evidenceQuote)).toContain(normalizeForMatch(answer));
      for (const [i, o] of q.options.entries()) {
        if (i === q.correctIndex) continue;
        expect(normalizeForMatch(q.evidenceQuote).split(' ')).not.toContain(normalizeForMatch(o));
      }
      expect(q.context?.text).toContain('_____');
    }
  });

  it('which-first e next-verse: a resposta respeita a ordem do texto', () => {
    const order = new Map(verses.map((v) => [v.ref, v.sequence]));
    const first = whichFirst(input('easy'));
    expect(first).not.toBeNull();
    expect(order.has(first!.sourceRef)).toBe(true);
    const next = nextVerse(input('medium'));
    if (next) {
      expect(normalizeForMatch(next.evidenceQuote)).toContain(normalizeForMatch(next.options[next.correctIndex]!.replace('…', '')));
    }
  });

  it('comentário: o versículo certo é o comentado, e os outros não', () => {
    const q = sourceVerse(input('medium', rashi));
    expect(q).not.toBeNull();
    expect(q!.template).toBe('comment-verse');
    const seg = rashi.find((r) => r.ref === q!.sourceRef)!;
    const anchor = verses.find((v) => v.ref === seg.anchors[0])!;
    expect(q!.options[q!.correctIndex]).toBe(excerpt(anchor.enText!, 12, 110));
    const author = commentAuthor(input('hard', rashi));
    expect(author?.options[author.correctIndex]).toBe('Rashi');
  });

  it('Mishná: o versículo certo está nas conexões do trecho', () => {
    const q = sourceVerse(input('medium', mishnah));
    if (!q) return;
    const seg = mishnah.find((r) => r.ref === q.sourceRef)!;
    const anchorTexts = seg.anchors.map((a) => verses.find((v) => v.ref === a.replace(/^(.*\s\d+:\d+).*$/, '$1'))).filter(Boolean).map((v) => excerpt(v!.enText!, 12, 110));
    expect(anchorTexts).toContain(q.options[q.correctIndex]);
  });

  it('parasha-of: Bereshit é a resposta para um versículo de Gênesis 1', () => {
    const q = parashaOf(input('medium'));
    expect(q!.options[q!.correctIndex]).toBe('Bereshit');
  });

  it('sempre devolve alguma pergunta da Torá, em qualquer nível', () => {
    for (const d of DIFFICULTIES) {
      const q = buildTemplateQuestion('torah', input(d));
      expect(q, d).not.toBeNull();
      expect(q!.options).toHaveLength(4);
      expect(q!.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q!.explanation.length).toBeLessThanOrEqual(600);
      expect(q!.evidenceQuote.length).toBeLessThanOrEqual(400);
      expect(q!.text.length).toBeLessThanOrEqual(300);
    }
  });
});

// ---------------------------------------------------------------------------
// Fase 8: um idioma por pergunta
// ---------------------------------------------------------------------------

const HEBREW = /[א-ת]/;
const LATIN = /[A-Za-z]/;

/** Português de mentira (a "tradução" é o inglês com um selo), para checar de onde vem cada texto. */
function withPt<T extends StudySeg>(list: readonly T[]): T[] {
  return list.map((r) => ({ ...r, tr: r.enText ? { text: `PT ${r.enText.replace(/[\u0590-\u05FF]+/g, '')}`, license: 'CC-BY-SA' } : null }));
}

describe.each(LOCALES)('idioma %s', (locale) => {
  const vs = locale === 'pt' ? withPt(verses) : verses;
  const segsOf = (list: StudySeg[]) => (locale === 'pt' ? withPt(list) : list);
  const input = (seed: number, difficulty: (typeof DIFFICULTIES)[number], segments: StudySeg[] = vs) => ({
    verses: vs,
    segments,
    parashaId: 'bereshit',
    difficulty,
    rng: seeded(seed),
    locale,
  });

  it('pergunta, alternativas, contexto e explicação saem todos no mesmo idioma', () => {
    let built = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const d of DIFFICULTIES) {
        for (const [track, segs] of [['torah', vs], ['commentators', segsOf(rashi)], ['mishnah', segsOf(mishnah)]] as const) {
          const q = buildTemplateQuestion(track, input(seed, d, segs as StudySeg[]));
          if (!q) continue;
          built++;
          const all = [q.text, ...q.options, q.context?.text ?? '', q.explanation].join(' ');
          if (locale === 'he') {
            expect(HEBREW.test(q.text), q.text).toBe(true);
            for (const o of q.options) expect(HEBREW.test(o) || /^\d+$/.test(o), o).toBe(true);
          } else {
            // As traduções de Rashi abrem cada comentário com as palavras em hebraico (o dibur hamatchil):
            // é parte do texto publicado. Alternativas e enunciado nunca têm hebraico.
            expect(HEBREW.test([q.text, ...q.options].join(' ')), all).toBe(false);
            const he = (all.match(/[א-ת]/g) ?? []).length;
            expect(he / (all.match(/\p{L}/gu) ?? []).length).toBeLessThan(0.08);
            expect(LATIN.test(q.options.join(' ')) || q.options.every((o) => /^\d+$/.test(o))).toBe(true);
          }
          expect(q.evidenceLanguage).toBe(locale);
          if (q.context) expect(q.context.language).toBe(locale);
          expect(q.fingerprint).toContain(`|${locale}|`);
          expect(q.machineTranslated).toBe(locale === 'pt' && q.template !== 'parasha-of' ? true : q.machineTranslated);
        }
      }
    }
    expect(built).toBeGreaterThan(10);
  });

  it('em português, os textos citados são a tradução guardada', () => {
    if (locale !== 'pt') return;
    const q = completeVerse(input(3, 'easy'));
    expect(q).not.toBeNull();
    expect(q!.evidenceQuote.startsWith('PT ')).toBe(true);
    expect(q!.machineTranslated).toBe(true);
    expect(q!.text).toBe('Qual palavra completa o versículo?');
  });
});

describe('sem texto no idioma, o trecho fica de fora', () => {
  it('português sem tradução guardada não monta pergunta (e não cai no inglês)', () => {
    for (const d of DIFFICULTIES) {
      const q = buildTemplateQuestion('torah', { verses, segments: verses, parashaId: 'bereshit', difficulty: d, rng: seeded(9), locale: 'pt' });
      expect(q).toBeNull();
    }
  });

  it('hebraico usa o original, com os Nomes grafados com reverência', () => {
    const q = completeVerse({ verses, segments: verses, parashaId: 'bereshit', difficulty: 'medium', rng: seeded(2), locale: 'he' });
    expect(q).not.toBeNull();
    expect(q!.optionsDirection).toBe('rtl');
    expect(q!.evidenceQuote).not.toMatch(/יהוה/);
    expect(q!.text).toBe('איזו מילה משלימה את הפסוק?');
  });

  it('parasha-of em inglês e hebraico usa o nome da parashá no idioma', () => {
    const en = parashaOf({ verses, segments: verses, parashaId: 'bereshit', difficulty: 'medium', rng: seeded(1), locale: 'en' });
    expect(en!.options[en!.correctIndex]).toBe('Bereshit');
    const he = parashaOf({ verses, segments: verses, parashaId: 'bereshit', difficulty: 'medium', rng: seeded(1), locale: 'he' });
    expect(he!.options[he!.correctIndex]).toBe('בראשית');
  });
});
