/**
 * Idiomas do jogo (Fase 8).
 *
 * O jogador escolhe português, inglês ou hebraico, e TUDO o que ele vê numa fase ou
 * partida sai nesse idioma: interface, pergunta, alternativas, trecho de contexto e
 * explicação. Nunca uma pergunta em português com alternativas em inglês.
 *
 * - Hebraico: os textos-fonte do Sefaria já vêm no original, sem tradução.
 * - Inglês e português: usa-se a tradução do próprio Sefaria quando houver (com
 *   licença aceita); senão, a tradução automática feita a partir do original e
 *   guardada no servidor (SegmentTranslation), que só é feita uma vez por trecho.
 */
import { z } from 'zod';

export const LOCALES = ['pt', 'en', 'he'] as const;
export type Locale = (typeof LOCALES)[number];
export const LocaleSchema = z.enum(LOCALES);
export const DEFAULT_LOCALE: Locale = 'pt';

/** Idiomas cujo conteúdo pode precisar de tradução automática (o hebraico é o original). */
export const TRANSLATED_LOCALES = ['pt', 'en'] as const satisfies readonly Locale[];
export type TranslatedLocale = (typeof TRANSLATED_LOCALES)[number];

export function isTranslatedLocale(locale: Locale): locale is TranslatedLocale {
  return locale !== 'he';
}

export interface LocaleInfo {
  /** Nome do idioma no próprio idioma (para o seletor). */
  nativeName: string;
  dir: 'ltr' | 'rtl';
  /** Etiqueta BCP-47 para formatar números e datas. */
  tag: string;
}

export const LOCALE_INFO: Readonly<Record<Locale, LocaleInfo>> = {
  pt: { nativeName: 'Português', dir: 'ltr', tag: 'pt-BR' },
  en: { nativeName: 'English', dir: 'ltr', tag: 'en-US' },
  he: { nativeName: 'עברית', dir: 'rtl', tag: 'he-IL' },
};

/** "pt-BR", "en_US", "iw", "he-IL" → idioma do jogo (português se não reconhecer). */
export function localeFromTag(tag: string | null | undefined): Locale {
  const base = (tag ?? '').trim().toLowerCase().split(/[-_]/)[0];
  if (base === 'en') return 'en';
  if (base === 'he' || base === 'iw') return 'he';
  return 'pt';
}

/** O que gravar em Question.locale (as perguntas antigas usavam "pt-BR"). */
export function questionLocale(locale: Locale): string {
  return locale;
}

export function parseQuestionLocale(value: string | null | undefined): Locale {
  return localeFromTag(value);
}

/**
 * Convenção reverente para os Nomes Divinos em cada idioma, usada nas traduções
 * automáticas e nos textos montados pelo jogo. Em hebraico, o Tetragrama é ה׳.
 */
export const DIVINE_NAME_STYLE: Readonly<Record<Locale, { god: string; tetragrammaton: string }>> = {
  pt: { god: "D'us", tetragrammaton: 'o Eterno' },
  en: { god: 'G-d', tetragrammaton: 'Hashem' },
  he: { god: 'אלוקים', tetragrammaton: 'ה׳' },
};

// ---------------------------------------------------------------------------
// Números hebraicos (gematria) para referências: 15 → ט״ו, 16 → ט״ז, 32 → ל״ב.
// ---------------------------------------------------------------------------

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

export function hebrewNumeral(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n >= 1000) return String(n);
  let rest = n % 100;
  let letters = HUNDREDS[Math.floor(n / 100)]!;
  if (rest === 15) letters += 'טו';
  else if (rest === 16) letters += 'טז';
  else {
    letters += TENS[Math.floor(rest / 10)]!;
    rest %= 10;
    letters += ONES[rest]!;
  }
  return letters.length === 1 ? `${letters}׳` : `${letters.slice(0, -1)}״${letters.slice(-1)}`;
}
