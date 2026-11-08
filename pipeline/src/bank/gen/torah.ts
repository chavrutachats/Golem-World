/**
 * Torá: parashiot, episódios, livros e capítulos. Tudo sai da divisão das parashiot do
 * Sefaria (packages/shared/journey/parashot.ts) e do texto da Torá; o trecho citado é o
 * versículo em hebraico (pt, he) e na JPS 1917 (en).
 */
import {
  catalogText,
  hasCatalogText,
  PARASHOT,
  parashaName,
  parashotForRef,
  parseTorahRef,
  torahBookName,
  TORAH_BOOKS,
  TORAH_BOOK_HE,
  type Difficulty,
  type Locale,
  type ParashaDef,
  type TorahBook,
} from '@trivia/shared';
import { firstWords, OpeningIndex, type BookText, type Corpus, type Segment } from '../corpus.js';
import { distractors, nearNumbers, num, perLocale, quoteOf, refKey, rngFor } from '../kit.js';
import type { Draft } from '../model.js';

const BOOK_PT: Readonly<Record<TorahBook, string>> = { Genesis: 'Gênesis', Exodus: 'Êxodo', Leviticus: 'Levítico', Numbers: 'Números', Deuteronomy: 'Deuteronômio' };

export function torahBookPlain(book: TorahBook, l: Locale): string {
  return l === 'pt' ? BOOK_PT[book] : l === 'he' ? TORAH_BOOK_HE[book] : book;
}

export function verseLabel(book: TorahBook, ch: number, v: number | null, l: Locale): string {
  const b = torahBookPlain(book, l);
  return v === null ? `${b} ${num(ch, l)}` : `${b} ${num(ch, l)}:${num(v, l)}`;
}

interface Books {
  he: Map<TorahBook, BookText>;
  en: Map<TorahBook, BookText>;
}

function load(corpus: Corpus): Books {
  const he = new Map<TorahBook, BookText>();
  const en = new Map<TorahBook, BookText>();
  for (const b of TORAH_BOOKS) {
    const h = corpus.text(b, 'he');
    if (!h) throw new Error(`Torá: falta o texto hebraico de ${b} no espelho do Sefaria.`);
    he.set(b, h);
    const e = corpus.text(b, 'en');
    if (e) en.set(b, e);
  }
  return { he, en };
}

/** O versículo nos dois textos: o hebraico (pt, he) e o inglês (en), quando houver. */
function verse(books: Books, book: TorahBook, ch: number, v: number) {
  const ref = `${book} ${ch}:${v}`;
  const he = books.he.get(book)!.byRef.get(ref);
  if (!he) return null;
  const enBook = books.en.get(book);
  const en = enBook?.byRef.get(ref) ?? null;
  return { ref, he, en, heBook: books.he.get(book)!, enBook };
}

type Verse = NonNullable<ReturnType<typeof verse>>;

/** Evidência no idioma: as primeiras palavras do versículo (hebraico para pt/he, JPS para en). */
function evidence(v: Verse, l: Locale, heWords = 8, enWords = 14) {
  if (l === 'en' && v.en && v.enBook) return quoteOf(v.enBook, firstWords(v.en.text, enWords));
  return quoteOf(v.heBook, firstWords(v.he.text, heWords));
}

function context(v: Verse, l: Locale, label: string, heWords = 9, enWords = 18) {
  const q = evidence(v, l, heWords, enWords);
  return { ...q, label };
}

const firstVerse = (p: ParashaDef) => {
  const r = parseTorahRef(p.ref)!;
  return { book: p.book, ch: r.start.chapter, v: r.start.verse ?? 1 };
};

function parashaOptions(p: ParashaDef, pool: readonly ParashaDef[], seed: string, near: boolean): ParashaDef[] {
  const rng = rngFor(seed);
  return [p, ...distractors(p, pool, rng, near ? (o) => Math.abs(o.number - p.number) : undefined)];
}

const pName = (p: ParashaDef) => (l: Locale) => parashaName(p, l);

export function torahGenerators(corpus: Corpus): Draft[] {
  const books = load(corpus);
  const out: Draft[] = [];
  const base = (p: ParashaDef | null) => ({ category: 'torah' as const, track: p ? ('torah' as const) : null, parashot: p ? [p.id] : [] });

  // 1. Em qual parashá acontece o episódio (legendas das fases do Golem World, já nos 3 idiomas).
  for (const p of PARASHOT) {
    const items = [...p.events.map((e) => ({ ...e, goal: false })), { ...p.goal, goal: true }];
    for (const [i, ev] of items.entries()) {
      if (!hasCatalogText(ev.captionPt, 'en') || !hasCatalogText(ev.captionPt, 'he')) continue;
      const r = parseTorahRef(ev.ref);
      if (!r) continue;
      const v = verse(books, r.book, r.start.chapter, r.start.verse ?? 1);
      if (!v || !parashotForRef(v.ref).includes(p.id)) continue;
      const opts = parashaOptions(p, ev.goal ? PARASHOT.filter((o) => o.book !== p.book) : PARASHOT.filter((o) => o.book === p.book), `event|${p.id}|${i}`, !ev.goal);
      if (opts.length < 4) continue;
      const cap = (l: Locale) => catalogText(ev.captionPt, l);
      out.push({
        id: `torah-event:${p.id}.${i}`,
        ...base(p),
        difficulty: ev.goal ? 'easy' : 'medium',
        kind: 'torah-event',
        sourceRef: v.ref,
        i18n: perLocale((l) => ({
          text: { pt: `Em qual parashá está este episódio: “${cap(l)}”?`, en: `Which parashah tells this episode: “${cap(l)}”?`, he: `באיזו פרשה מסופר: „${cap(l)}”?` }[l],
          options: opts.map((o) => parashaName(o, l)),
          explanation: {
            pt: `O episódio está em ${verseLabel(r.book, r.start.chapter, r.start.verse ?? 1, l)}, na parashá ${parashaName(p, l)}.`,
            en: `The episode is in ${verseLabel(r.book, r.start.chapter, r.start.verse ?? 1, l)}, in parashat ${parashaName(p, l)}.`,
            he: `הסיפור נמצא ב${verseLabel(r.book, r.start.chapter, r.start.verse ?? 1, l)}, בפרשת ${parashaName(p, l)}.`,
          }[l],
          evidence: evidence(v, l),
          context: null,
        })),
      });
    }
  }

  // 2. Livro de cada parashá.
  for (const p of PARASHOT) {
    const f = firstVerse(p);
    const v = verse(books, f.book, f.ch, f.v);
    if (!v) continue;
    const rng = rngFor(`book|${p.id}`);
    const opts = [p.book, ...distractors(p.book, TORAH_BOOKS, rng)];
    out.push({
      id: `torah-book:${p.id}`,
      ...base(p),
      difficulty: 'easy',
      kind: 'torah-book-of-parasha',
      sourceRef: v.ref,
      i18n: perLocale((l) => ({
        text: { pt: `A parashá ${parashaName(p, l)} está em qual livro da Torá?`, en: `Parashat ${parashaName(p, l)} is in which book of the Torah?`, he: `פרשת ${parashaName(p, l)} נמצאת באיזה חומש?` }[l],
        options: opts.map((b) => torahBookName(b, l)),
        explanation: {
          pt: `A parashá ${parashaName(p, l)} começa em ${verseLabel(p.book, f.ch, f.v, l)}.`,
          en: `Parashat ${parashaName(p, l)} begins at ${verseLabel(p.book, f.ch, f.v, l)}.`,
          he: `פרשת ${parashaName(p, l)} מתחילה ב${verseLabel(p.book, f.ch, f.v, l)}.`,
        }[l],
        evidence: evidence(v, l),
        context: null,
      })),
    });
  }

  // 3. Parashá seguinte e anterior (no ciclo anual).
  for (const [idx, p] of PARASHOT.entries()) {
    for (const dir of ['next', 'prev'] as const) {
      const other = PARASHOT[idx + (dir === 'next' ? 1 : -1)];
      if (!other) continue;
      const f = firstVerse(dir === 'next' ? other : p);
      const v = verse(books, f.book, f.ch, f.v);
      if (!v) continue;
      const opts = parashaOptions(other, PARASHOT.filter((o) => o !== p), `${dir}|${p.id}`, true);
      out.push({
        id: `torah-${dir}:${p.id}`,
        ...base(p),
        difficulty: 'medium',
        kind: `torah-${dir}`,
        sourceRef: v.ref,
        i18n: perLocale((l) => ({
          text:
            dir === 'next'
              ? { pt: `Qual parashá vem logo depois de ${parashaName(p, l)}?`, en: `Which parashah comes right after ${parashaName(p, l)}?`, he: `איזו פרשה באה מיד אחרי ${parashaName(p, l)}?` }[l]
              : { pt: `Qual parashá vem logo antes de ${parashaName(p, l)}?`, en: `Which parashah comes right before ${parashaName(p, l)}?`, he: `איזו פרשה באה מיד לפני ${parashaName(p, l)}?` }[l],
          options: opts.map((o) => parashaName(o, l)),
          explanation:
            dir === 'next'
              ? { pt: `Depois de ${parashaName(p, l)} vem ${parashaName(other, l)}, que começa em ${verseLabel(f.book, f.ch, f.v, l)}.`, en: `After ${parashaName(p, l)} comes ${parashaName(other, l)}, which begins at ${verseLabel(f.book, f.ch, f.v, l)}.`, he: `אחרי ${parashaName(p, l)} באה פרשת ${parashaName(other, l)}, שמתחילה ב${verseLabel(f.book, f.ch, f.v, l)}.` }[l]
              : { pt: `${parashaName(p, l)} começa em ${verseLabel(f.book, f.ch, f.v, l)}, logo depois do fim de ${parashaName(other, l)}.`, en: `${parashaName(p, l)} begins at ${verseLabel(f.book, f.ch, f.v, l)}, right after the end of ${parashaName(other, l)}.`, he: `פרשת ${parashaName(p, l)} מתחילה ב${verseLabel(f.book, f.ch, f.v, l)}, מיד אחרי סוף פרשת ${parashaName(other, l)}.` }[l],
          evidence: evidence(v, l),
          context: null,
        })),
      });
    }
  }

  // 4. Qual parashá começa com estas palavras (a abertura mais curta que só ela tem).
  const openings = PARASHOT.map((p) => {
    const f = firstVerse(p);
    return { p, v: verse(books, f.book, f.ch, f.v) };
  });
  const allFirsts = new OpeningIndex([...books.he.values()].flatMap((b) => b.segments.map((s) => s.text)));
  for (const { p, v } of openings) {
    if (!v) continue;
    const opening = allFirsts.unique(v.he.text, 3, 8);
    if (!opening) continue;
    const opts = parashaOptions(p, PARASHOT.filter((o) => o.book === p.book), `opening|${p.id}`, true);
    if (opts.length < 4) continue;
    out.push({
      id: `torah-opening:${p.id}`,
      ...base(p),
      difficulty: 'medium',
      kind: 'torah-opening',
      sourceRef: v.ref,
      i18n: perLocale((l) => ({
        text: { pt: 'Qual parashá começa com estas palavras?', en: 'Which parashah begins with these words?', he: 'איזו פרשה פותחת במילים האלה?' }[l],
        options: opts.map((o) => parashaName(o, l)),
        explanation: {
          pt: `São as primeiras palavras de ${parashaName(p, l)} (${verseLabel(p.book, firstVerse(p).ch, firstVerse(p).v, l)}).`,
          en: `These are the opening words of ${parashaName(p, l)} (${verseLabel(p.book, firstVerse(p).ch, firstVerse(p).v, l)}).`,
          he: `אלה המילים הפותחות את פרשת ${parashaName(p, l)} (${verseLabel(p.book, firstVerse(p).ch, firstVerse(p).v, l)}).`,
        }[l],
        evidence: l === 'en' && v.en && v.enBook ? quoteOf(v.enBook, firstWords(v.en.text, 14)) : quoteOf(v.heBook, opening),
        context: {
          ...(l === 'en' && v.en && v.enBook ? quoteOf(v.enBook, firstWords(v.en.text, 10)) : quoteOf(v.heBook, opening)),
          label: { pt: 'O começo da parashá', en: 'How the parashah begins', he: 'תחילת הפרשה' }[l],
        },
      })),
    });
  }

  // 5. Em qual capítulo começa a parashá.
  for (const p of PARASHOT) {
    const f = firstVerse(p);
    const v = verse(books, f.book, f.ch, f.v);
    if (!v) continue;
    const chapters = Math.max(...books.he.get(p.book)!.segments.map((s) => s.indices[0]! + 1));
    const opts = [f.ch, ...nearNumbers(f.ch, rngFor(`startch|${p.id}`)).filter((n) => n <= chapters)];
    if (opts.length < 4) continue;
    out.push({
      id: `torah-start-chapter:${p.id}`,
      ...base(p),
      difficulty: 'hard',
      kind: 'torah-start-chapter',
      sourceRef: v.ref,
      numeric: true,
      i18n: perLocale((l) => ({
        text: { pt: `A parashá ${parashaName(p, l)} começa em qual capítulo de ${torahBookPlain(p.book, l)}?`, en: `Parashat ${parashaName(p, l)} begins in which chapter of ${torahBookPlain(p.book, l)}?`, he: `באיזה פרק ב${torahBookPlain(p.book, l)} מתחילה פרשת ${parashaName(p, l)}?` }[l],
        options: opts.map((n) => num(n, l)),
        explanation: { pt: `Ela começa em ${verseLabel(p.book, f.ch, f.v, l)}.`, en: `It begins at ${verseLabel(p.book, f.ch, f.v, l)}.`, he: `היא מתחילה ב${verseLabel(p.book, f.ch, f.v, l)}.` }[l],
        evidence: evidence(v, l),
        context: null,
      })),
    });
  }

  // 6. Em qual parashá está o versículo (o 1º de cada capítulo: vizinhas do mesmo livro; o do meio: de outros livros).
  for (const b of TORAH_BOOKS) {
    const text = books.he.get(b)!;
    const byChapter = new Map<number, Segment[]>();
    for (const s of text.segments) {
      const c = s.indices[0]! + 1;
      byChapter.set(c, [...(byChapter.get(c) ?? []), s]);
    }
    for (const [ch, segs] of byChapter) {
      for (const which of ['first', 'middle'] as const) {
        const vv = which === 'first' ? 1 : Math.ceil(segs.length / 2);
        const v = verse(books, b, ch, vv);
        if (!v) continue;
        const ids = parashotForRef(v.ref);
        const p = PARASHOT.find((x) => x.id === ids[0]);
        if (!p || ids.length !== 1) continue;
        const pool = which === 'first' ? PARASHOT.filter((o) => o.book === b) : PARASHOT.filter((o) => o.book !== b || o === p);
        const opts = parashaOptions(p, pool, `verse|${v.ref}`, which === 'first');
        if (opts.length < 4) continue;
        out.push({
          id: `torah-verse:${refKey(v.ref)}`,
          ...base(p),
          difficulty: which === 'first' ? 'hard' : 'medium',
          kind: 'torah-parasha-of-verse',
          sourceRef: v.ref,
          i18n: perLocale((l) => ({
            text: { pt: `Em qual parashá está ${verseLabel(b, ch, vv, l)}?`, en: `Which parashah contains ${verseLabel(b, ch, vv, l)}?`, he: `באיזו פרשה נמצא הפסוק ${verseLabel(b, ch, vv, l)}?` }[l],
            options: opts.map((o) => parashaName(o, l)),
            explanation: {
              pt: `${verseLabel(b, ch, vv, l)} faz parte da parashá ${parashaName(p, l)} (${p.ref.replace(b, torahBookPlain(b, l))}).`,
              en: `${verseLabel(b, ch, vv, l)} is part of parashat ${parashaName(p, l)} (${p.ref}).`,
              he: `${verseLabel(b, ch, vv, l)} שייך לפרשת ${parashaName(p, l)}.`,
            }[l],
            evidence: evidence(v, l),
            context: context(v, l, { pt: verseLabel(b, ch, vv, l), en: verseLabel(b, ch, vv, l), he: verseLabel(b, ch, vv, l) }[l]),
          })),
        });
      }
    }

    // 7. Quantos versículos tem cada capítulo (especialista).
    for (const [ch, segs] of byChapter) {
      const n = segs.length;
      const v = verse(books, b, ch, n);
      if (!v) continue;
      const p = PARASHOT.find((x) => x.id === parashotForRef(v.ref)[0]) ?? null;
      const opts = [n, ...nearNumbers(n, rngFor(`count|${b}|${ch}`))];
      out.push({
        id: `torah-verse-count:${b}_${ch}`,
        ...base(p),
        difficulty: 'expert',
        kind: 'torah-verse-count',
        sourceRef: v.ref,
        numeric: true,
        i18n: perLocale((l) => ({
          text: { pt: `Quantos versículos tem o capítulo ${ch} de ${torahBookPlain(b, l)}?`, en: `How many verses are in chapter ${ch} of ${torahBookPlain(b, l)}?`, he: `כמה פסוקים יש בפרק ${num(ch, l)} של ספר ${torahBookPlain(b, l)}?` }[l],
          options: opts.map(String),
          explanation: { pt: `O último versículo do capítulo é ${verseLabel(b, ch, n, l)}.`, en: `The chapter's last verse is ${verseLabel(b, ch, n, l)}.`, he: `הפסוק האחרון בפרק הוא ${verseLabel(b, ch, n, l)}.` }[l],
          evidence: evidence(v, l),
          context: null,
        })),
      });
    }
  }

  // 8. Quantos capítulos e quantas parashiot tem cada livro.
  for (const b of TORAH_BOOKS) {
    const text = books.he.get(b)!;
    const chapters = Math.max(...text.segments.map((s) => s.indices[0]! + 1));
    const last = text.segments.filter((s) => s.indices[0] === chapters - 1)[0]!;
    const v = verse(books, b, chapters, 1)!;
    const count = PARASHOT.filter((p) => p.book === b).length;
    const items: { id: string; n: number; step: number; diff: Difficulty; q: Record<Locale, string>; e: Record<Locale, string> }[] = [
      {
        id: `torah-chapters:${b}`,
        n: chapters,
        step: 2,
        diff: 'medium',
        q: perLocale((l) => ({ pt: `Quantos capítulos tem o livro de ${torahBookPlain(b, l)}?`, en: `How many chapters are in the book of ${torahBookPlain(b, l)}?`, he: `כמה פרקים יש בספר ${torahBookPlain(b, l)}?` })[l]),
        e: perLocale((l) => ({ pt: `O último capítulo é ${verseLabel(b, chapters, null, l)}.`, en: `The last chapter is ${verseLabel(b, chapters, null, l)}.`, he: `הפרק האחרון הוא ${verseLabel(b, chapters, null, l)}.` })[l]),
      },
      {
        id: `torah-parasha-count:${b}`,
        n: count,
        step: 1,
        diff: 'medium',
        q: perLocale((l) => ({ pt: `Quantas parashiot tem o livro de ${torahBookPlain(b, l)}?`, en: `How many parashiyot are in the book of ${torahBookPlain(b, l)}?`, he: `כמה פרשות יש בספר ${torahBookPlain(b, l)}?` })[l]),
        e: perLocale((l) => ({
          pt: `São ${count}: de ${parashaName(PARASHOT.find((p) => p.book === b)!, l)} a ${parashaName(PARASHOT.filter((p) => p.book === b).at(-1)!, l)}.`,
          en: `There are ${count}: from ${parashaName(PARASHOT.find((p) => p.book === b)!, l)} to ${parashaName(PARASHOT.filter((p) => p.book === b).at(-1)!, l)}.`,
          he: `יש ${count}: מפרשת ${parashaName(PARASHOT.find((p) => p.book === b)!, l)} ועד פרשת ${parashaName(PARASHOT.filter((p) => p.book === b).at(-1)!, l)}.`,
        })[l]),
      },
    ];
    void last;
    for (const it of items) {
      const opts = [it.n, ...nearNumbers(it.n, rngFor(it.id), it.step)];
      out.push({
        id: it.id,
        ...base(null),
        difficulty: it.diff,
        kind: it.id.split(':')[0]!,
        sourceRef: v.ref,
        numeric: true,
        i18n: perLocale((l) => ({ text: it.q[l], options: opts.map(String), explanation: it.e[l], evidence: evidence(v, l), context: null })),
      });
    }
  }
  return out;
}
