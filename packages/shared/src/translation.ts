/**
 * Tradução automática dos textos-fonte e das perguntas escritas pela IA (Fase 8).
 *
 * O que fica aqui é puro (sem rede): o prompt, o formato da resposta e as
 * checagens. A API usa para traduzir na hora (tela de preparo) e o pipeline para
 * traduzir em lote. Toda tradução passa pelas checagens antes de ir para o banco;
 * a que falha é descartada e o trecho simplesmente não entra na fase.
 *
 * Regras de fidelidade (iguais às do resto do projeto):
 * - traduz a partir do ORIGINAL hebraico/aramaico; a tradução inglesa do Sefaria,
 *   quando existe com licença aceita, vai junto só como apoio;
 * - nada de acrescentar explicação, nota ou interpretação;
 * - Nomes Divinos com a grafia reverente do idioma (o Eterno / D'us; Hashem / G-d);
 * - nomes próprios transliterados do hebraico (Moshe, Avraham, Yaakov…).
 */
import { z } from 'zod';
import { DIVINE_NAME_STYLE, type Locale, type TranslatedLocale } from './i18n.js';
import { findDivineNameIssues, stripHebrewMarks } from './text.js';

export const TRANSLATION_PROMPT_VERSION = 'translate@1.0.0';

const LANGUAGE_NAME: Readonly<Record<Locale, string>> = {
  pt: 'Brazilian Portuguese',
  en: 'English',
  he: 'Modern Hebrew',
};

const NAME_EXAMPLES: Readonly<Record<Locale, string>> = {
  pt: 'Moshe, Aharon, Avraham, Sará, Itschak, Rivka, Yaakov, Rachel, Leá, Yossef, Yehudá, Essav, Lavan, Miriam, Bil’am, Pinechás, Yehoshua, Mitsráyim (ou Egito), Iardén (Jordão), Cohen/cohanim, Mishcan, Shabat',
  en: 'Moshe, Aharon, Avraham, Sarah, Yitzchak, Rivka, Yaakov, Rachel, Leah, Yosef, Yehudah, Esav, Lavan, Miriam, Bilam, Pinchas, Yehoshua, Egypt, the Jordan, kohen/kohanim, Mishkan, Shabbat',
  he: '',
};

export interface SegmentToTranslate {
  /** Identificador devolvido na resposta (o id do StudyText). */
  id: string;
  ref: string;
  /** Original em hebraico/aramaico. */
  he: string | null;
  /** Tradução inglesa do Sefaria, quando houver com licença aceita (apoio). */
  en: string | null;
}

export function segmentSystemPrompt(target: TranslatedLocale): string {
  const style = DIVINE_NAME_STYLE[target];
  return [
    `You translate classical Jewish texts (Torah verses, Mishnah, Talmud, Midrash, Rashi, Ramban, Ibn Ezra, Sforno, Zohar, Sefer HaChinukh) into ${LANGUAGE_NAME[target]} for a study game.`,
    'Rules:',
    '1. Translate from the Hebrew/Aramaic original. When an English reference translation is given, use it only to resolve meaning; never copy its additions.',
    '2. Be faithful and complete. Do not add explanations, notes, glosses, headings, brackets or interpretation that are not in the source. Do not skip words.',
    '3. Keep each item separate; return exactly one translation per id, in the same order.',
    `4. Divine names, with reverence: the Tetragrammaton (YHVH, often written ה׳ or ה') → "${style.tetragrammaton}"; Elohim (meaning G-d) → "${style.god}". Never spell out or transliterate the Tetragrammaton (no Yahweh, Jehovah, YHWH).`,
    `5. Proper names are transliterated from Hebrew, as in: ${NAME_EXAMPLES[target]}.`,
    '6. Quotations of verses inside a commentary stay as quotations.',
    '7. Plain text only (no markdown, no HTML).',
  ].join('\n');
}

export function segmentUserPrompt(items: readonly SegmentToTranslate[]): string {
  return JSON.stringify(
    {
      items: items.map((i) => ({ id: i.id, ref: i.ref, hebrew: i.he ?? null, english_reference: i.en ?? null })),
    },
    null,
    0,
  );
}

export const SegmentTranslationOutputSchema = z.object({
  items: z.array(z.object({ id: z.string(), text: z.string() })),
});
export type SegmentTranslationOutput = z.infer<typeof SegmentTranslationOutputSchema>;

/** JSON Schema da resposta (saída estruturada do provedor). */
export const SEGMENT_TRANSLATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'text'],
        properties: { id: { type: 'string' }, text: { type: 'string' } },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Checagens
// ---------------------------------------------------------------------------

const HEBREW_LETTER = /[א-ת]/g;
const LATIN_LETTER = /[A-Za-zÀ-ÿ]/g;
/** Marcas de quem "conversa" em vez de traduzir. */
const CHATTER = /^(?:note|nota|translation|tradução|tradu[cç][aã]o|here is|aqui est[aá]|translator|tradutor)\b|\[(?:note|nota|sic)\]|\(translator|\(tradutor/iu;

export type TranslationProblem =
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'untranslated'
  | 'wrong_script'
  | 'chatter'
  | 'divine_name';

function countMatches(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

/**
 * Confere uma tradução de um trecho. Devolve o primeiro problema ou null.
 * Os limites de tamanho são largos de propósito: o hebraico é compacto e as
 * traduções costumam ter de 1,2 a 3 vezes mais letras.
 */
export function checkSegmentTranslation(source: SegmentToTranslate, text: string, target: TranslatedLocale): TranslationProblem | null {
  const out = text.trim();
  if (!out) return 'empty';
  if (CHATTER.test(out)) return 'chatter';
  const heChars = stripHebrewMarks(source.he ?? '').replace(/\s+/g, '').length;
  const enChars = (source.en ?? '').replace(/\s+/g, '').length;
  const outChars = out.replace(/\s+/g, '').length;
  if (enChars >= 20) {
    if (outChars < enChars * 0.45) return 'too_short';
    if (outChars > enChars * 2.4 + 40) return 'too_long';
  } else if (heChars >= 10) {
    if (outChars < heChars * 0.6) return 'too_short';
    if (outChars > heChars * 6 + 40) return 'too_long';
  }
  const hebrew = countMatches(out, HEBREW_LETTER);
  const latin = countMatches(out, LATIN_LETTER);
  if (hebrew > Math.max(3, latin * 0.05)) return 'untranslated';
  if (latin < 3) return 'wrong_script';
  if (findDivineNameIssues(out).some((i) => i.severity === 'error')) return 'divine_name';
  return null;
}

// ---------------------------------------------------------------------------
// Perguntas escritas pela IA (origin = llm), que nascem em português
// ---------------------------------------------------------------------------

export interface QuestionToTranslate {
  id: string;
  text: string;
  options: readonly string[];
  explanation: string;
  evidenceQuote: string;
  contextLabel: string | null;
  contextText: string | null;
}

export const QuestionTranslationOutputSchema = z.object({
  text: z.string(),
  options: z.array(z.string()),
  explanation: z.string(),
  evidenceQuote: z.string(),
  contextLabel: z.string().nullable(),
  contextText: z.string().nullable(),
});
export type QuestionTranslationOutput = z.infer<typeof QuestionTranslationOutputSchema>;

export const QUESTION_TRANSLATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'options', 'explanation', 'evidenceQuote', 'contextLabel', 'contextText'],
  properties: {
    text: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
    explanation: { type: 'string' },
    evidenceQuote: { type: 'string' },
    contextLabel: { type: ['string', 'null'] },
    contextText: { type: ['string', 'null'] },
  },
};

export function questionSystemPrompt(target: Locale): string {
  const style = DIVINE_NAME_STYLE[target];
  return [
    `You translate quiz questions about Jewish texts from Brazilian Portuguese into ${LANGUAGE_NAME[target]}.`,
    'Rules:',
    '1. Translate the question, the 4 options (same order, same meaning, still 4 DIFFERENT options), the explanation, the evidence quote and the optional context.',
    '2. Do not change which option is correct, do not add hints, do not add or remove information.',
    `3. Divine names: "o Eterno"/"Hashem" → "${style.tetragrammaton}"; "D'us" → "${style.god}". Never spell out or transliterate the Tetragrammaton.`,
    target === 'he'
      ? '4. Book, parashah and person names in their usual Hebrew spelling. Sefaria references (like "Genesis 1:1") stay as they are.'
      : `4. Proper names transliterated from Hebrew, as in: ${NAME_EXAMPLES[target]}. Sefaria references (like "Genesis 1:1") stay as they are.`,
    '5. Plain text only. Keep the same JSON fields; null stays null.',
  ].join('\n');
}

export function questionUserPrompt(q: QuestionToTranslate): string {
  return JSON.stringify({
    text: q.text,
    options: q.options,
    explanation: q.explanation,
    evidenceQuote: q.evidenceQuote,
    contextLabel: q.contextLabel,
    contextText: q.contextText,
  });
}

/** Limites das colunas de Question (as traduções vão para colunas do mesmo tamanho). */
export const QUESTION_LIMITS = { text: 300, option: 200, explanation: 600, evidenceQuote: 400, contextLabel: 160, contextText: 2000 } as const;

function normalizeOption(s: string): string {
  return stripHebrewMarks(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export type QuestionTranslationProblem = TranslationProblem | 'option_count' | 'duplicate_options' | 'null_mismatch';

export function checkQuestionTranslation(source: QuestionToTranslate, out: QuestionTranslationOutput, target: Locale): QuestionTranslationProblem | null {
  if (out.options.length !== source.options.length) return 'option_count';
  if (new Set(out.options.map(normalizeOption)).size !== out.options.length) return 'duplicate_options';
  if ((source.contextText === null) !== (out.contextText === null)) return 'null_mismatch';
  const fields: [string, number][] = [
    [out.text, QUESTION_LIMITS.text],
    [out.explanation, QUESTION_LIMITS.explanation],
    [out.evidenceQuote, QUESTION_LIMITS.evidenceQuote],
    ...out.options.map((o): [string, number] => [o, QUESTION_LIMITS.option]),
    ...(out.contextText ? ([[out.contextText, QUESTION_LIMITS.contextText]] as [string, number][]) : []),
    ...(out.contextLabel ? ([[out.contextLabel, QUESTION_LIMITS.contextLabel]] as [string, number][]) : []),
  ];
  for (const [value, max] of fields) {
    if (!value.trim()) return 'empty';
    if (value.length > max) return 'too_long';
  }
  const all = [out.text, out.explanation, ...out.options].join(' ');
  if (CHATTER.test(out.text.trim())) return 'chatter';
  const hebrew = countMatches(all, HEBREW_LETTER);
  const latin = countMatches(all, LATIN_LETTER);
  if (target === 'he') {
    if (hebrew < latin) return 'wrong_script';
  } else {
    if (hebrew > Math.max(6, latin * 0.08)) return 'untranslated';
    if (findDivineNameIssues(all).some((i) => i.severity === 'error')) return 'divine_name';
  }
  return null;
}
