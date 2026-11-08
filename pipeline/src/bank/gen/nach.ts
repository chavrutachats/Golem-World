/**
 * Profetas e Escritos: de qual livro é o versículo, qual salmo começa assim, quantos
 * capítulos tem cada livro e a ordem dos livros no Tanach. O trecho mostrado é a abertura
 * mais curta que só aquele versículo tem em todo o Tanach (assim a resposta é uma só).
 */
import { type Locale } from '@trivia/shared';
import { OpeningIndex, type Corpus, type SchemaDoc, type Segment } from '../corpus.js';
import { distractors, nearNumbers, num, pairOf, perLocale, quoteFor, refKey, rngFor } from '../kit.js';
import type { Draft } from '../model.js';
import { NACH_PT, PROPHETS, WRITINGS } from '../names.js';

const NACH = [...PROPHETS, ...WRITINGS];

export function nachGenerators(corpus: Corpus): Draft[] {
  const out: Draft[] = [];
  const he = new Map<string, string>();
  const books = NACH.filter((b) => corpus.text(b, 'he'));
  for (const b of books) he.set(b, (corpus.schema<SchemaDoc>(b)?.heTitle ?? b).trim());
  const name = (b: string, l: Locale) => (l === 'pt' ? NACH_PT[b]! : l === 'he' ? he.get(b)! : b);
  const label = (b: string, ch: number, v: number | null, l: Locale) => `${name(b, l)} ${num(ch, l)}${v === null ? '' : `:${num(v, l)}`}`;
  const section = (b: string) => (PROPHETS.includes(b) ? PROPHETS : WRITINGS);
  const base = { category: 'neviim_ketuvim' as const, track: null, parashot: [] };

  // Todas as aberturas do Tanach, para conferir que o trecho mostrado é único.
  const allTanakh = new OpeningIndex(
    ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', ...NACH].flatMap((t) => corpus.text(t, 'he')?.segments.map((s) => s.text) ?? []),
  );

  for (const b of books) {
    const text = corpus.text(b, 'he')!;
    const byChapter = new Map<number, Segment[]>();
    for (const s of text.segments) byChapter.set(s.indices[0]! + 1, [...(byChapter.get(s.indices[0]! + 1) ?? []), s]);
    const order = NACH.indexOf(b);

    // 1. De qual livro é o versículo (o 1º e o do meio de cada capítulo). Salmos tem pergunta própria.
    if (b !== 'Psalms') {
      for (const [ch, segs] of byChapter) {
        for (const which of ['first', 'middle'] as const) {
          const vv = which === 'first' ? 1 : Math.ceil((segs.length + 1) / 2);
          if (which === 'middle' && vv === 1) continue;
          const p = pairOf(corpus, b, `${b} ${ch}:${vv}`);
          if (!p) continue;
          const opening = allTanakh.unique(p.he.text, 4, 10);
          // Sem trechos com ketiv e qeri ("[...]"): ficam confusos fora do contexto.
          if (!opening || opening.includes('[')) continue;
          const near = which === 'first';
          const pool = near ? section(b) : NACH;
          const opts = [b, ...distractors(b, pool, rngFor(`nachverse|${p.ref}`), near ? (o) => Math.abs(NACH.indexOf(o) - order) : undefined)];
          if (opts.length < 4) continue;
          out.push({
            id: `nach-verse:${refKey(p.ref)}`,
            ...base,
            difficulty: near ? 'expert' : 'hard',
            kind: 'nach-book-of-verse',
            sourceRef: p.ref,
            i18n: perLocale((l) => ({
              text: { pt: 'De qual livro é este versículo?', en: 'Which book is this verse from?', he: 'מאיזה ספר הפסוק הזה?' }[l],
              options: opts.map((o) => name(o, l)),
              explanation: { pt: `É ${label(b, ch, vv, l)}.`, en: `It is ${label(b, ch, vv, l)}.`, he: `זהו ${label(b, ch, vv, l)}.` }[l],
              evidence: quoteFor(p, l, 10, 16, opening),
              context: { ...quoteFor(p, l, 10, 16, opening), label: { pt: 'O versículo', en: 'The verse', he: 'הפסוק' }[l] },
            })),
          });
        }
      }
    } else {
      // 2. Qual salmo começa assim (números vizinhos).
      for (const ch of byChapter.keys()) {
        const p = pairOf(corpus, b, `${b} ${ch}:1`);
        if (!p) continue;
        const opening = allTanakh.unique(p.he.text, 3, 10);
        if (!opening || opening.includes('[')) continue;
        const opts = [ch, ...nearNumbers(ch, rngFor(`psalm|${ch}`)).filter((n) => n <= byChapter.size)];
        if (opts.length < 4) continue;
        out.push({
          id: `nach-psalm:${ch}`,
          ...base,
          difficulty: ch === 1 || ch === 23 || ch === 150 ? 'hard' : 'expert',
          kind: 'nach-psalm-number',
          sourceRef: p.ref,
          numeric: true,
          i18n: perLocale((l) => ({
            text: { pt: 'Qual salmo começa assim?', en: 'Which psalm begins like this?', he: 'איזה מזמור בתהלים פותח כך?' }[l],
            options: opts.map((n) => ({ pt: `Salmo ${n}`, en: `Psalm ${n}`, he: `תהלים ${num(n, 'he')}` })[l]),
            explanation: { pt: `É o começo do Salmo ${ch}.`, en: `It is the opening of Psalm ${ch}.`, he: `זו פתיחת תהלים ${num(ch, 'he')}.` }[l],
            evidence: quoteFor(p, l, 10, 16, opening),
            context: { ...quoteFor(p, l, 10, 16, opening), label: { pt: 'O começo do salmo', en: 'The opening of the psalm', he: 'פתיחת המזמור' }[l] },
          })),
        });
      }
    }

    // 3. Quantos capítulos tem o livro.
    const chapters = Math.max(...byChapter.keys());
    const lastP = pairOf(corpus, b, `${b} ${chapters}:1`);
    if (lastP) {
      const opts = [chapters, ...nearNumbers(chapters, rngFor(`nachch|${b}`), Math.max(1, Math.round(chapters / 12)))];
      out.push({
        id: `nach-chapters:${refKey(b)}`,
        ...base,
        difficulty: ['Psalms', 'Isaiah', 'Jonah', 'Ruth', 'Esther'].includes(b) ? 'medium' : 'hard',
        kind: 'nach-chapter-count',
        sourceRef: lastP.ref,
        numeric: true,
        i18n: perLocale((l) => ({
          text: { pt: `Quantos capítulos tem o livro de ${name(b, l)}?`, en: `How many chapters are in the book of ${name(b, l)}?`, he: `כמה פרקים יש בספר ${name(b, l)}?` }[l],
          options: opts.map(String),
          explanation: { pt: `O último capítulo é ${label(b, chapters, null, l)}.`, en: `The last chapter is ${label(b, chapters, null, l)}.`, he: `הפרק האחרון הוא ${label(b, chapters, null, l)}.` }[l],
          evidence: quoteFor(lastP, l),
          context: null,
        })),
      });
    }

    // 4. Ordem dos livros no Tanach (livro seguinte e anterior).
    for (const dir of ['next', 'prev'] as const) {
      const other = NACH[order + (dir === 'next' ? 1 : -1)];
      if (!other || !books.includes(other)) continue;
      const p = pairOf(corpus, dir === 'next' ? other : b, `${dir === 'next' ? other : b} 1:1`);
      if (!p) continue;
      const opts = [other, ...distractors(other, NACH.filter((x) => x !== b && books.includes(x)), rngFor(`nach${dir}|${b}`), (o) => Math.abs(NACH.indexOf(o) - NACH.indexOf(other)))];
      out.push({
        id: `nach-${dir}:${refKey(b)}`,
        ...base,
        difficulty: 'medium',
        kind: `nach-${dir}`,
        sourceRef: p.ref,
        i18n: perLocale((l) => ({
          text:
            dir === 'next'
              ? { pt: `No Tanach, qual livro vem logo depois de ${name(b, l)}?`, en: `In the Tanakh, which book comes right after ${name(b, l)}?`, he: `בתנ״ך, איזה ספר בא מיד אחרי ${name(b, l)}?` }[l]
              : { pt: `No Tanach, qual livro vem logo antes de ${name(b, l)}?`, en: `In the Tanakh, which book comes right before ${name(b, l)}?`, he: `בתנ״ך, איזה ספר בא מיד לפני ${name(b, l)}?` }[l],
          options: opts.map((o) => name(o, l)),
          explanation:
            dir === 'next'
              ? { pt: `Depois de ${name(b, l)} vem ${name(other, l)}, na ordem do Sefaria.`, en: `After ${name(b, l)} comes ${name(other, l)}, in Sefaria's order.`, he: `אחרי ${name(b, l)} בא ${name(other, l)}, לפי הסדר בספריא.` }[l]
              : { pt: `Antes de ${name(b, l)} vem ${name(other, l)}, na ordem do Sefaria.`, en: `Before ${name(b, l)} comes ${name(other, l)}, in Sefaria's order.`, he: `לפני ${name(b, l)} בא ${name(other, l)}, לפי הסדר בספריא.` }[l],
          evidence: quoteFor(p, l),
          context: null,
        })),
      });
    }
  }
  return out;
}
