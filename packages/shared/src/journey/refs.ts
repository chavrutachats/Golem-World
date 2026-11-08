/**
 * Referências de versículo da Torá no formato do Sefaria ("Genesis 1:3",
 * "Genesis 1:30-2:3") e comparação de posição entre versículos.
 *
 * Os números seguem a versificação hebraica do Sefaria (ex.: Gênesis 32:3 é o último
 * versículo de Vayetsê; em algumas traduções cristãs é 32:2).
 */

export const TORAH_BOOKS = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'] as const;
export type TorahBook = (typeof TORAH_BOOKS)[number];

export interface VersePoint {
  book: TorahBook;
  chapter: number;
  verse: number;
}

export interface VerseRange {
  book: TorahBook;
  start: { chapter: number; verse: number };
  end: { chapter: number; verse: number };
}

const BOOK_SET = new Set<string>(TORAH_BOOKS);

export function isTorahBook(name: string): name is TorahBook {
  return BOOK_SET.has(name);
}

/** Posição comparável dentro da Torá inteira (livro, capítulo, versículo). */
export function verseKey(p: VersePoint): number {
  return TORAH_BOOKS.indexOf(p.book) * 1_000_000 + p.chapter * 1000 + p.verse;
}

/**
 * Lê "Genesis 1:3", "Genesis 1:3-5", "Genesis 1:30-2:3" ou "Genesis 1" (capítulo
 * inteiro). Devolve null para qualquer coisa que não seja um trecho da Torá.
 */
export function parseTorahRef(ref: string): VerseRange | null {
  const m = /^([A-Z][a-z]+)\s+(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/.exec(ref.trim());
  if (!m || !isTorahBook(m[1]!)) return null;
  const book = m[1];
  const c1 = Number(m[2]);
  const v1 = m[3] ? Number(m[3]) : 1;
  let c2 = c1;
  let v2 = m[3] ? v1 : 999;
  if (m[4]) {
    if (m[5]) {
      c2 = Number(m[4]);
      v2 = Number(m[5]);
    } else if (m[3]) {
      v2 = Number(m[4]);
    } else {
      c2 = Number(m[4]);
      v2 = 999;
    }
  }
  if (![c1, v1, c2, v2].every((n) => Number.isInteger(n) && n > 0)) return null;
  const range: VerseRange = { book, start: { chapter: c1, verse: v1 }, end: { chapter: c2, verse: v2 } };
  if (verseKey({ book, ...range.end }) < verseKey({ book, ...range.start })) return null;
  return range;
}

export function rangeStartKey(r: VerseRange): number {
  return verseKey({ book: r.book, ...r.start });
}

export function rangeEndKey(r: VerseRange): number {
  return verseKey({ book: r.book, ...r.end });
}

/** Os dois intervalos têm ao menos um versículo em comum? */
export function rangesOverlap(a: VerseRange, b: VerseRange): boolean {
  return rangeStartKey(a) <= rangeEndKey(b) && rangeStartKey(b) <= rangeEndKey(a);
}

export function rangeContains(outer: VerseRange, inner: VerseRange): boolean {
  return rangeStartKey(outer) <= rangeStartKey(inner) && rangeEndKey(inner) <= rangeEndKey(outer);
}

/** "Genesis 1:1-6:8" a partir do intervalo. */
export function formatRange(r: VerseRange): string {
  const start = `${r.start.chapter}:${r.start.verse}`;
  if (r.start.chapter === r.end.chapter && r.start.verse === r.end.verse) return `${r.book} ${start}`;
  const end = r.start.chapter === r.end.chapter ? `${r.end.verse}` : `${r.end.chapter}:${r.end.verse}`;
  return `${r.book} ${start}-${end}`;
}

/** Abreviações em português usadas na interface ("Gn 1:3"). */
export const TORAH_BOOK_ABBR_PT: Readonly<Record<TorahBook, string>> = {
  Genesis: 'Gn',
  Exodus: 'Êx',
  Leviticus: 'Lv',
  Numbers: 'Nm',
  Deuteronomy: 'Dt',
};

export function shortRefPt(ref: string): string {
  const m = /^([A-Z][a-z]+)\s+(.*)$/.exec(ref.trim());
  if (!m || !isTorahBook(m[1]!)) return ref;
  return `${TORAH_BOOK_ABBR_PT[m[1]]} ${m[2]}`;
}
