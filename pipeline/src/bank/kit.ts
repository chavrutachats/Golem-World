/**
 * Peças comuns dos geradores do banco: sorteio com semente (o mesmo banco a cada build),
 * escolha de distratores e a montagem final (embaralha as alternativas igual nos três
 * idiomas).
 */
import { createHash } from 'node:crypto';
import { hebrewNumeral, OPTION_COUNT, type Locale } from '@trivia/shared';
import type { BankQuestion, Draft, Localized, Quote } from './model.js';
import type { BookText, Segment } from './corpus.js';
import type { Names } from './names.js';

export const LOCALES: readonly Locale[] = ['pt', 'en', 'he'];

export type Rng = () => number;

export function rngFor(seed: string): Rng {
  let h = createHash('sha256').update(seed).digest().readUInt32LE(0) || 1;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Três distratores do conjunto (sem a resposta), preferindo os "vizinhos" quando `near` é dado. */
export function distractors<T>(correct: T, pool: readonly T[], rng: Rng, near?: (a: T) => number): T[] {
  const others = pool.filter((p) => p !== correct);
  if (others.length < OPTION_COUNT - 1) return [];
  if (!near) return shuffled(others, rng).slice(0, OPTION_COUNT - 1);
  // Os mais próximos primeiro, com um pouco de acaso entre os de mesma distância.
  return [...others]
    .map((o) => ({ o, d: near(o) + rng() * 0.5 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, OPTION_COUNT - 1)
    .map((x) => x.o);
}

/** Números perto da resposta (contagens): distintos, positivos, com a resposta numa posição qualquer. */
export function nearNumbers(n: number, rng: Rng, step = 1): number[] {
  const offsets = shuffled([-3, -2, -1, 1, 2, 3], rng).map((k) => k * step);
  const out: number[] = [];
  for (const k of offsets) {
    if (n + k > 0 && !out.includes(n + k)) out.push(n + k);
    if (out.length === OPTION_COUNT - 1) break;
  }
  return out;
}

export function names(pt: string, en: string, he: string): Names {
  return { pt, en, he };
}

/** Os textos de cada idioma de uma pergunta, montados por uma função do idioma. */
export function perLocale<T>(fn: (l: Locale) => T): Record<Locale, T> {
  return { pt: fn('pt'), en: fn('en'), he: fn('he') };
}

/** Número de capítulo/versículo como se escreve em cada idioma. */
export function num(n: number, l: Locale): string {
  return l === 'he' ? hebrewNumeral(n) : String(n);
}

export function quoteOf(book: BookText, text: string): Quote {
  return { text, lang: book.lang, versionTitle: book.versionTitle, license: book.license };
}

/** O trecho no idioma do jogador: o inglês para en (se houver), o original hebraico para pt e he. */
export function pickText(l: Locale, he: { book: BookText; seg: Segment; text: string }, en?: { book: BookText; seg: Segment; text: string } | null) {
  return l === 'en' && en ? en : he;
}

/** Monta a pergunta final: a resposta (posição 0 do rascunho) vai para um lugar sorteado. */
export function finalize(d: Draft): BankQuestion {
  const rng = rngFor(`order|${d.id}`);
  const order = d.numeric
    ? [0, 1, 2, 3].sort((a, b) => parseInt(d.i18n.pt.options[a]!, 10) - parseInt(d.i18n.pt.options[b]!, 10))
    : shuffled([0, 1, 2, 3], rng);
  const i18n = perLocale((l) => {
    const src = d.i18n[l];
    const loc: Localized = { ...src, options: order.map((k) => src.options[k]!) };
    return loc;
  });
  return {
    id: d.id,
    category: d.category,
    track: d.track ?? null,
    parashot: d.parashot ?? [],
    difficulty: d.difficulty,
    kind: d.kind,
    sourceRef: d.sourceRef,
    correctIndex: order.indexOf(0),
    i18n,
  };
}

/** Parte do id a partir de uma referência ("Genesis 1:1" → "Genesis_1.1"). */
export function refKey(ref: string): string {
  return ref.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Um segmento nos dois idiomas do acervo: o original hebraico e a tradução inglesa, se houver. */
export interface Pair {
  ref: string;
  he: Segment;
  heBook: BookText;
  en: Segment | null;
  enBook: BookText | null;
}

export function pairOf(corpus: import('./corpus.js').Corpus, title: string, ref: string): Pair | null {
  const heBook = corpus.text(title, 'he');
  const he = heBook?.byRef.get(ref);
  if (!heBook || !he) return null;
  const enBook = corpus.text(title, 'en');
  return { ref, he, heBook, en: enBook?.byRef.get(ref) ?? null, enBook: enBook ?? null };
}

/** Citação no idioma: o começo do texto inglês para en (se houver), o hebraico para pt e he. */
export function quoteFor(p: Pair, l: Locale, heWords = 8, enWords = 14, heText?: string): Quote {
  const en = l === 'en' && p.en && p.enBook ? firstWordsOf(p.en.text, enWords) : '';
  if (en.replace(/[^\p{L}]/gu, '').length >= 4) return quoteOf(p.enBook!, en);
  return quoteOf(p.heBook, heText ?? firstWordsOf(p.he.text, heWords));
}

function firstWordsOf(text: string, n: number): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, n)
    .join(' ')
    .replace(/[,;:.־׃]+$/u, '');
}
