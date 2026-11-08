/**
 * Perguntas de molde: montadas NA HORA, por código, a partir dos textos do Sefaria
 * guardados em StudyText. Não há IA nesta etapa, então não há o que alucinar: a
 * resposta certa é sempre um pedaço do próprio texto (a palavra que falta, o
 * versículo seguinte, o versículo que a mishná cita…) e a explicação mostra a fonte.
 *
 * Cada molde recebe os segmentos da parashá, um sorteador e a dificuldade pedida,
 * e devolve uma pergunta pronta (ou null, se aquele texto não serve para o molde).
 * Os nomes divinos nunca viram lacuna nem alternativa.
 *
 * Fase 8: a pergunta inteira sai no idioma do jogador. O texto citado é o original
 * (hebraico), a tradução do Sefaria (inglês/português) ou a tradução automática
 * guardada (`tr`); um trecho sem texto nesse idioma simplesmente não entra.
 */
import {
  OPTION_COUNT,
  PARASHOT,
  commentatorName,
  parashaById,
  parashaName,
  parashotForRef,
  renderDivineNamesForDisplay,
  shortRef,
  sourceBookName,
  stripHebrewMarks,
  torahBookName,
  type Difficulty,
  type JourneyTrack,
  type Locale,
  type SourceLanguage,
  type TorahBook,
} from '@trivia/shared';
import { TEMPLATE_COPY } from './template-copy.js';

export interface Rng {
  /** Inteiro em [0, n). */
  int(n: number): number;
}

export interface StudySeg {
  id: string;
  ref: string;
  track: JourneyTrack;
  bookTitle: string;
  author: string | null;
  sequence: number;
  heText: string | null;
  heVersionTitle: string | null;
  heLicense: string | null;
  enText: string | null;
  enVersionTitle: string | null;
  enLicense: string | null;
  ptText: string | null;
  ptVersionTitle: string | null;
  ptLicense: string | null;
  anchors: string[];
  parashot: string[];
  /** Tradução automática para o idioma da fase (só pt/en), quando houver e estiver em dia. */
  tr?: { text: string; license: string | null } | null;
}

export const TEMPLATE_IDS = [
  'complete-verse',
  'which-first',
  'next-verse',
  'parasha-of',
  'chapter-of',
  'comment-verse',
  'comment-author',
  'source-verse',
  'which-book',
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface TemplateQuestion {
  template: TemplateId;
  difficulty: Difficulty;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sourceRef: string;
  evidenceQuote: string;
  evidenceLanguage: SourceLanguage;
  context: { label: string; text: string; language: SourceLanguage } | null;
  optionsDirection: 'ltr' | 'rtl';
  /** Segmento citado na resposta (vai para Question.studyTextId). */
  studyTextId: string;
  versionTitle: string | null;
  license: string | null;
  /** O trecho citado é tradução automática. */
  machineTranslated: boolean;
  /** Chave estável: a mesma pergunta montada de novo não vira outra linha no banco. */
  fingerprint: string;
}

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------

export interface Display {
  text: string;
  lang: SourceLanguage;
  versionTitle: string | null;
  license: string | null;
  machine: boolean;
}

/**
 * O texto do trecho no idioma da fase: hebraico (original, com os Nomes grafados com
 * reverência), a tradução do Sefaria nesse idioma ou a tradução automática guardada.
 * Sem nenhum deles, null: o trecho fica de fora (nunca se mistura idioma).
 */
/**
 * As traduções inglesas de Rashi abrem com as palavras comentadas em hebraico e logo
 * em inglês ("יהי רקיע BE THERE AN EXPANSE — …"). Fora do hebraico, tira-se só esse
 * começo em hebraico, que repete o que vem em seguida.
 */
export function stripLeadingHebrew(text: string): string {
  const m = /^((?:[\u0590-\u05FF"'״׳־.,:;()]+\s+)+)(?=[A-Za-zÀ-ÿ“"‘'(])/u.exec(text);
  return m ? text.slice(m[0].length) : text;
}

export function displayOf(seg: StudySeg, locale: Locale): Display | null {
  if (locale === 'he') {
    const raw = seg.heText?.trim();
    return raw ? { text: renderDivineNamesForDisplay(raw), lang: 'he', versionTitle: seg.heVersionTitle, license: seg.heLicense, machine: false } : null;
  }
  const native = locale === 'pt' ? seg.ptText : seg.enText;
  if (native?.trim()) {
    return {
      text: stripLeadingHebrew(native.trim()),
      lang: locale,
      versionTitle: locale === 'pt' ? seg.ptVersionTitle : seg.enVersionTitle,
      license: locale === 'pt' ? seg.ptLicense : seg.enLicense,
      machine: false,
    };
  }
  if (seg.tr?.text.trim()) {
    return { text: seg.tr.text.trim(), lang: locale, versionTitle: seg.heVersionTitle, license: seg.tr.license, machine: true };
  }
  return null;
}

export function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Primeiras palavras de um texto, com reticências se cortou. */
export function excerpt(text: string, maxWords: number, maxChars = 140): string {
  const w = wordsOf(text);
  let out = w.slice(0, maxWords).join(' ');
  if (out.length > maxChars) out = out.slice(0, maxChars).replace(/\s+\S*$/, '');
  return out.length < text.trim().length ? `${out.replace(/[,;:.]+$/, '')}…` : out;
}

function cap(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

const STOPWORDS = new Set(
  (
    'a o e é de do da dos das em no na nos nas num numa um uma uns umas que para pra por pelo pela pelos pelas com sem se ' +
    'ao aos à às os as eu tu ele ela nós vós eles elas lhe lhes me te nos vos seu sua seus suas meu minha meus minhas teu tua ' +
    'teus tuas nosso nossa vosso vossa isto isso aquilo este esta estes estas esse essa esses essas aquele aquela não nem mas ' +
    'como quando então pois porque também todo toda todos todas sobre entre até depois antes assim ali aqui lá disse disseram ' +
    'dizer dizendo havia houve foi foram era eram são será serão ser sendo está estava estar ter tem tinha tinham tendo vez ' +
    'the and of to in that for with his her him they them their was were be is are as on at by from this which who whom ' +
    'shall unto thee thou thy thine ye said saying not but all also into upon there then when what will would have had has'
  ).split(/\s+/),
);

/** Nomes e títulos divinos que nunca viram lacuna nem alternativa. */
const DIVINE_WORDS = /^(deus|d'us|d’us|eterno|senhor|adonai|hashem|elohim|el|shadai|god|g-d|lord|yhwh|jeová|iavé)$/iu;
const HEBREW_DIVINE = /(יהוה|יהו|אלה|אלו|אדנ|שדי|^אל$|^יה$|^ה׳$)/u;

export function cleanWord(token: string): string {
  return token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
}

export function normalizedWord(word: string): string {
  return stripHebrewMarks(word)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function isDivine(word: string, lang: SourceLanguage): boolean {
  if (lang === 'he') return HEBREW_DIVINE.test(stripHebrewMarks(word).replace(/[־]/g, ''));
  return DIVINE_WORDS.test(word);
}

interface Candidate {
  word: string;
  index: number;
  proper: boolean;
}

/** Palavras que podem virar lacuna: nada de artigo, preposição ou Nome divino. */
export function blankCandidates(text: string, lang: SourceLanguage): Candidate[] {
  const tokens = wordsOf(text);
  const out: Candidate[] = [];
  tokens.forEach((tok, index) => {
    const word = cleanWord(tok);
    if (!word || isDivine(word, lang)) return;
    if (lang === 'he') {
      if (stripHebrewMarks(word).length >= 3) out.push({ word, index, proper: false });
      return;
    }
    if (word.length < 4 || STOPWORDS.has(word.toLowerCase())) return;
    const prev = tokens[index - 1] ?? '';
    const sentenceStart = index === 0 || /[.!?:;"“«]$/.test(prev);
    out.push({ word, index, proper: /^\p{Lu}/u.test(word) && !sentenceStart });
  });
  return out;
}

function pick<T>(rng: Rng, list: readonly T[]): T | undefined {
  return list.length ? list[rng.int(list.length)] : undefined;
}

function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Monta as 4 alternativas na ordem canônica (o servidor embaralha de novo por jogador). */
function withOptions(correct: string, distractors: readonly string[], rng: Rng): { options: string[]; correctIndex: number } | null {
  const seen = new Set([normalizedWord(correct)]);
  const unique: string[] = [];
  for (const d of distractors) {
    const k = normalizedWord(d);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(d);
    if (unique.length === OPTION_COUNT - 1) break;
  }
  if (unique.length < OPTION_COUNT - 1) return null;
  const options = shuffle(rng, [correct, ...unique]);
  return { options, correctIndex: options.indexOf(correct) };
}

function chapterOf(ref: string): number | null {
  const m = /\s(\d+):\d+$/.exec(ref);
  return m ? Number(m[1]) : null;
}

export interface TemplateInput {
  /** Versículos da parashá (trilha torah), em ordem. */
  verses: readonly StudySeg[];
  /** Segmentos da trilha (para Torá, os próprios versículos). */
  segments: readonly StudySeg[];
  parashaId: string;
  difficulty: Difficulty;
  rng: Rng;
  locale: Locale;
}

type Builder = (input: TemplateInput) => TemplateQuestion | null;

// ---------------------------------------------------------------------------
// Moldes da Torá
// ---------------------------------------------------------------------------

/** Letras de uma palavra hebraica sem sinais (para medir dificuldade). */
function heLength(word: string): number {
  return stripHebrewMarks(word).replace(/[^א-ת]/g, '').length;
}

/** "Qual palavra completa o versículo?" — a lacuna sai do próprio texto. */
export const completeVerse: Builder = ({ verses, difficulty, rng, locale }) => {
  const copy = TEMPLATE_COPY[locale];
  const pool = shuffle(rng, verses).slice(0, 30);
  for (const verse of pool) {
    const d = displayOf(verse, locale);
    if (!d) continue;
    const n = wordsOf(d.text).length;
    if (n < 6 || n > 60) continue;
    const cands = blankCandidates(d.text, d.lang);
    let target: Candidate | undefined;
    if (d.lang === 'he') {
      // Sem maiúsculas para achar nomes próprios: a dificuldade vem do tamanho da palavra.
      const minLen = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 4 : 3;
      target = pick(rng, cands.filter((c) => heLength(c.word) >= minLen)) ?? (difficulty === 'easy' ? undefined : pick(rng, cands));
    } else {
      const wantProper = difficulty === 'easy';
      target =
        pick(rng, cands.filter((c) => (wantProper ? c.proper : difficulty === 'medium' ? c.word.length >= 6 : !c.proper))) ??
        (difficulty === 'easy' ? undefined : pick(rng, cands));
    }
    if (!target) continue;
    const inVerse = new Set(wordsOf(d.text).map((t) => normalizedWord(cleanWord(t))));
    const others: string[] = [];
    for (const v of shuffle(rng, verses)) {
      if (v.id === verse.id) continue;
      const od = displayOf(v, locale);
      if (!od) continue;
      for (const c of blankCandidates(od.text, od.lang)) {
        if (c.proper !== target.proper && d.lang !== 'he') continue;
        const gap = d.lang === 'he' ? Math.abs(heLength(c.word) - heLength(target.word)) : Math.abs(c.word.length - target.word.length);
        if (gap > (d.lang === 'he' ? 1 : 3)) continue;
        if (inVerse.has(normalizedWord(c.word))) continue;
        others.push(c.word);
      }
      if (others.length > 30) break;
    }
    const opts = withOptions(target.word, shuffle(rng, others), rng);
    if (!opts) continue;
    const tokens = wordsOf(d.text);
    const blanked = tokens.map((t, i) => (i === target.index ? t.replace(cleanWord(t), '_____') : t)).join(' ');
    const level: Difficulty =
      d.lang === 'he'
        ? heLength(target.word) >= 5 ? 'medium' : heLength(target.word) >= 4 ? 'hard' : 'expert'
        : target.proper ? 'easy' : target.word.length >= 6 ? 'medium' : 'hard';
    return {
      template: 'complete-verse',
      difficulty: level,
      text: copy.completeVerse,
      ...opts,
      explanation: cap(`${shortRef(verse.ref, locale)}: ${copy.quote(d.text)}`, 600),
      sourceRef: verse.ref,
      evidenceQuote: cap(d.text, 400),
      evidenceLanguage: d.lang,
      context: { label: shortRef(verse.ref, locale), text: cap(blanked, 2000), language: d.lang },
      optionsDirection: d.lang === 'he' ? 'rtl' : 'ltr',
      studyTextId: verse.id,
      versionTitle: d.versionTitle,
      license: d.license,
      machineTranslated: d.machine,
      fingerprint: `complete-verse|${locale}|${verse.ref}|${target.index}`,
    };
  }
  return null;
};

/** "Qual destes trechos aparece primeiro?" — quanto mais perto os versículos, mais difícil. */
export const whichFirst: Builder = ({ verses, difficulty, rng, locale }) => {
  const copy = TEMPLATE_COPY[locale];
  const usable = verses.filter((v) => displayOf(v, locale));
  if (usable.length < 12) return null;
  const window = { easy: usable.length, medium: Math.ceil(usable.length / 2), hard: 14, expert: 7 }[difficulty];
  const span = Math.min(usable.length, Math.max(OPTION_COUNT * 2, window));
  const start = rng.int(usable.length - span + 1);
  const slice = usable.slice(start, start + span);
  const chosen = shuffle(rng, slice).slice(0, OPTION_COUNT);
  const sorted = [...chosen].sort((a, b) => a.sequence - b.sequence);
  const last = rng.int(3) === 0;
  const answer = last ? sorted[sorted.length - 1]! : sorted[0]!;
  const texts = chosen.map((v) => excerpt(displayOf(v, locale)!.text, 14));
  if (new Set(texts.map(normalizedWord)).size < OPTION_COUNT) return null;
  const correctText = texts[chosen.indexOf(answer)]!;
  const options = shuffle(rng, texts);
  const d = displayOf(answer, locale)!;
  return {
    template: 'which-first',
    difficulty,
    text: last ? copy.whichLast : copy.whichFirst,
    options,
    correctIndex: options.indexOf(correctText),
    explanation: cap(copy.orderIs(sorted.map((v) => shortRef(v.ref, locale)).join(copy.arrow)), 600),
    sourceRef: answer.ref,
    evidenceQuote: cap(d.text, 400),
    evidenceLanguage: d.lang,
    context: null,
    optionsDirection: d.lang === 'he' ? 'rtl' : 'ltr',
    studyTextId: answer.id,
    versionTitle: d.versionTitle,
    license: d.license,
    machineTranslated: d.machine,
    fingerprint: `which-first|${locale}|${last ? 'last' : 'first'}|${chosen.map((v) => v.ref).sort().join(',')}`,
  };
};

/** "Qual versículo vem logo depois deste?" */
export const nextVerse: Builder = ({ verses, difficulty, rng, locale }) => {
  const copy = TEMPLATE_COPY[locale];
  for (let attempt = 0; attempt < 12; attempt++) {
    const i = rng.int(Math.max(1, verses.length - 1));
    const verse = verses[i];
    const next = verses[i + 1];
    if (!verse || !next || next.sequence !== verse.sequence + 1) continue;
    const d = displayOf(verse, locale);
    const nd = displayOf(next, locale);
    if (!d || !nd) continue;
    const near = difficulty === 'hard' || difficulty === 'expert';
    const pool = verses.filter((v) => {
      const gap = Math.abs(v.sequence - verse.sequence);
      return gap > 1 && (near ? gap <= 12 : gap > 4);
    });
    const distractors = shuffle(rng, pool)
      .map((v) => displayOf(v, locale))
      .filter((x): x is Display => !!x)
      .map((x) => excerpt(x.text, 14));
    const correct = excerpt(nd.text, 14);
    const opts = withOptions(correct, distractors, rng);
    if (!opts) continue;
    return {
      template: 'next-verse',
      difficulty: near ? (d.lang === 'he' ? 'expert' : 'hard') : 'medium',
      text: copy.nextVerse,
      ...opts,
      explanation: cap(copy.nextExpl(shortRef(verse.ref, locale), shortRef(next.ref, locale), nd.text), 600),
      sourceRef: next.ref,
      evidenceQuote: cap(nd.text, 400),
      evidenceLanguage: nd.lang,
      context: { label: shortRef(verse.ref, locale), text: cap(d.text, 2000), language: d.lang },
      optionsDirection: d.lang === 'he' ? 'rtl' : 'ltr',
      studyTextId: next.id,
      versionTitle: nd.versionTitle,
      license: nd.license,
      machineTranslated: nd.machine,
      fingerprint: `next-verse|${locale}|${verse.ref}|${near ? 'near' : 'far'}`,
    };
  }
  return null;
};

/** "Em qual parashá está este versículo?" — para revisões que misturam parashiot. */
export const parashaOf: Builder = ({ verses, difficulty, rng, locale }) => {
  const copy = TEMPLATE_COPY[locale];
  const verse = pick(rng, verses);
  if (!verse) return null;
  const d = displayOf(verse, locale);
  const home = parashotForRef(verse.ref)[0];
  const p = home ? parashaById(home) : undefined;
  if (!d || !p) return null;
  const sameBook = PARASHOT.filter((x) => x.book === p.book && x.id !== p.id);
  const pool =
    difficulty === 'easy'
      ? PARASHOT.filter((x) => x.book !== p.book)
      : difficulty === 'medium'
        ? sameBook.filter((x) => Math.abs(x.number - p.number) > 2)
        : sameBook.filter((x) => Math.abs(x.number - p.number) <= 3);
  const name = (x: typeof p) => parashaName(x, locale);
  const opts = withOptions(name(p), shuffle(rng, pool.length >= 3 ? pool : sameBook).map(name), rng);
  if (!opts) return null;
  return {
    template: 'parasha-of',
    difficulty,
    text: copy.parashaOf,
    ...opts,
    explanation: cap(copy.parashaExpl(shortRef(verse.ref, locale), name(p), p.nameHe, shortRef(p.ref, locale)), 600),
    sourceRef: verse.ref,
    evidenceQuote: cap(d.text, 400),
    evidenceLanguage: d.lang,
    context: { label: copy.labelVerse, text: cap(d.text, 2000), language: d.lang },
    optionsDirection: locale === 'he' ? 'rtl' : 'ltr',
    studyTextId: verse.id,
    versionTitle: d.versionTitle,
    license: d.license,
    machineTranslated: d.machine,
    fingerprint: `parasha-of|${locale}|${verse.ref}|${difficulty}`,
  };
};

/** "Em que capítulo está este versículo?" (Especialista). */
export const chapterOfVerse: Builder = ({ verses, rng, locale }) => {
  const copy = TEMPLATE_COPY[locale];
  const verse = pick(rng, verses);
  if (!verse) return null;
  const ch = chapterOf(verse.ref);
  const d = displayOf(verse, locale);
  if (!ch || !d) return null;
  const book = verse.ref.split(' ')[0]! as TorahBook;
  const label = (c: number) => (locale === 'he' ? hebrewChapter(c) : String(c));
  const candidates = [ch - 3, ch - 2, ch - 1, ch + 1, ch + 2, ch + 3].filter((c) => c >= 1).map(label);
  const opts = withOptions(label(ch), shuffle(rng, candidates), rng);
  if (!opts) return null;
  return {
    template: 'chapter-of',
    difficulty: 'expert',
    text: copy.chapterOf(torahBookName(book, locale)),
    ...opts,
    explanation: cap(copy.itIs(shortRef(verse.ref, locale)), 600),
    sourceRef: verse.ref,
    evidenceQuote: cap(d.text, 400),
    evidenceLanguage: d.lang,
    context: { label: copy.labelVerse, text: cap(d.text, 2000), language: d.lang },
    optionsDirection: locale === 'he' ? 'rtl' : 'ltr',
    studyTextId: verse.id,
    versionTitle: d.versionTitle,
    license: d.license,
    machineTranslated: d.machine,
    fingerprint: `chapter-of|${locale}|${verse.ref}`,
  };
};

/** Capítulo em letras hebraicas ("פרק ל״ב"). */
function hebrewChapter(n: number): string {
  return `פרק ${shortRef(`Genesis ${n}`, 'he').split(' ')[1]}`;
}

// ---------------------------------------------------------------------------
// Moldes das trilhas
// ---------------------------------------------------------------------------

function verseByRef(verses: readonly StudySeg[]): Map<string, StudySeg> {
  return new Map(verses.map((v) => [v.ref, v]));
}

/** Primeiro versículo de uma âncora ("Genesis 1:1-3" → "Genesis 1:1"). */
function firstVerseOf(anchor: string): string {
  return anchor.replace(/^(\S+(?:\s\S+)*?\s\d+:\d+).*$/, '$1');
}

function verseOptionText(v: StudySeg, locale: Locale): string | null {
  const d = displayOf(v, locale);
  return d ? excerpt(d.text, 12, 110) : null;
}

/**
 * "Qual versículo este trecho explica/cita?" — serve para comentaristas, Midrash,
 * Mishná, Talmud, Zohar e Sefer HaChinuch. A âncora vem da estrutura do comentário
 * ou das conexões do Sefaria; os distratores são versículos da mesma parashá que o
 * trecho NÃO cita.
 */
export const sourceVerse: Builder = ({ verses, segments, parashaId, difficulty, rng, locale }) => {
  const copy = TEMPLATE_COPY[locale];
  const byRef = verseByRef(verses);
  for (const seg of shuffle(rng, segments).slice(0, 25)) {
    const d = displayOf(seg, locale);
    if (!d || wordsOf(d.text).length < 5) continue;
    const anchorsHere = seg.anchors.map(firstVerseOf).filter((a) => byRef.has(a));
    const anchorRef = pick(rng, anchorsHere);
    if (!anchorRef) continue;
    const anchor = byRef.get(anchorRef)!;
    const covered = new Set(seg.anchors.flatMap((a) => coveredVerses(a, verses)));
    const near = difficulty === 'hard' || difficulty === 'expert';
    const pool = verses.filter((v) => !covered.has(v.ref) && (near ? Math.abs(v.sequence - anchor.sequence) <= 10 : Math.abs(v.sequence - anchor.sequence) > 3));
    const correct = verseOptionText(anchor, locale);
    if (!correct) continue;
    const opts = withOptions(correct, shuffle(rng, pool).map((v) => verseOptionText(v, locale)).filter((x): x is string => !!x), rng);
    if (!opts) continue;
    const isComment = seg.track === 'commentators';
    const author = seg.author ? commentatorName(seg.author, locale) : null;
    const label = isComment ? (author ?? copy.labelComment) : refLabel(seg, locale);
    const p = parashaById(parashaId);
    return {
      template: isComment ? 'comment-verse' : 'source-verse',
      difficulty: near ? 'hard' : 'medium',
      text: isComment
        ? copy.commentVerse(author ?? copy.someCommentator)
        : copy.sourceVerse(sourceBookName(seg.bookTitle, locale), p ? parashaName(p, locale) : copy.thisParasha),
      ...opts,
      explanation: cap(
        isComment
          ? copy.commentExpl(author ?? copy.someCommentator, shortRef(anchor.ref, locale), seg.ref)
          : copy.sourceExpl(refLabel(seg, locale), shortRef(anchor.ref, locale)),
        600,
      ),
      sourceRef: seg.ref,
      evidenceQuote: cap(d.text, 400),
      evidenceLanguage: d.lang,
      context: { label, text: cap(d.text, 2000), language: d.lang },
      optionsDirection: locale === 'he' ? 'rtl' : 'ltr',
      studyTextId: seg.id,
      versionTitle: d.versionTitle,
      license: d.license,
      machineTranslated: d.machine,
      fingerprint: `${isComment ? 'comment-verse' : 'source-verse'}|${locale}|${seg.ref}|${anchor.ref}|${near ? 'near' : 'far'}`,
    };
  }
  return null;
};

/** Versículos cobertos por uma âncora (um versículo ou um intervalo no mesmo capítulo). */
function coveredVerses(anchor: string, verses: readonly StudySeg[]): string[] {
  const m = /^(.*\s)(\d+):(\d+)(?:-(\d+)(?::(\d+))?)?$/.exec(anchor);
  if (!m) return [anchor];
  const [, prefix, c1, v1, x, y] = m;
  if (!x) return [anchor];
  const startKey = Number(c1) * 1000 + Number(v1);
  const endKey = y ? Number(x) * 1000 + Number(y) : Number(c1) * 1000 + Number(x);
  return verses
    .filter((v) => {
      const mm = /\s(\d+):(\d+)$/.exec(v.ref);
      if (!mm || !v.ref.startsWith(prefix!)) return false;
      const k = Number(mm[1]) * 1000 + Number(mm[2]);
      return k >= startKey && k <= endKey;
    })
    .map((v) => v.ref);
}

function refLabel(seg: StudySeg, locale: Locale): string {
  const name = sourceBookName(seg.bookTitle, locale);
  const addr = seg.ref.slice(seg.bookTitle.length).trim().replace(/^,\s*/, '');
  return addr ? `${name} ${addr}` : name;
}

export const COMMENTATOR_NAMES = ['Rashi', 'Ramban', 'Ibn Ezra', 'Sforno'] as const;

/** "Quem escreveu este comentário?" */
export const commentAuthor: Builder = ({ segments, rng, locale }) => {
  const copy = TEMPLATE_COPY[locale];
  for (const seg of shuffle(rng, segments).slice(0, 20)) {
    if (!seg.author || !(COMMENTATOR_NAMES as readonly string[]).includes(seg.author)) continue;
    const d = displayOf(seg, locale);
    if (!d || wordsOf(d.text).length < 8) continue;
    const anchor = seg.anchors[0];
    const name = (n: string) => commentatorName(n, locale);
    const opts = withOptions(name(seg.author), shuffle(rng, COMMENTATOR_NAMES.filter((n) => n !== seg.author)).map(name), rng);
    if (!opts || !anchor) continue;
    return {
      template: 'comment-author',
      difficulty: locale === 'he' ? 'expert' : 'hard',
      text: copy.commentAuthor,
      ...opts,
      explanation: cap(copy.commentAuthorExpl(name(seg.author), shortRef(anchor, locale), seg.ref), 600),
      sourceRef: seg.ref,
      evidenceQuote: cap(d.text, 400),
      evidenceLanguage: d.lang,
      context: { label: copy.labelCommentOn(shortRef(anchor, locale)), text: cap(d.text, 2000), language: d.lang },
      optionsDirection: locale === 'he' ? 'rtl' : 'ltr',
      studyTextId: seg.id,
      versionTitle: d.versionTitle,
      license: d.license,
      machineTranslated: d.machine,
      fingerprint: `comment-author|${locale}|${seg.ref}`,
    };
  }
  return null;
};

/** "De qual livro/tratado é este trecho?" (Mishná, Talmud, Midrash). */
export const whichBook: Builder = ({ segments, rng, locale }) => {
  const copy = TEMPLATE_COPY[locale];
  const books = [...new Set(segments.map((s) => s.bookTitle))];
  if (books.length < OPTION_COUNT) return null;
  const seg = pick(rng, segments);
  if (!seg) return null;
  const d = displayOf(seg, locale);
  if (!d || wordsOf(d.text).length < 8) return null;
  const name = (t: string) => sourceBookName(t, locale);
  const correct = name(seg.bookTitle);
  const opts = withOptions(correct, shuffle(rng, books.filter((b) => b !== seg.bookTitle)).map(name), rng);
  if (!opts) return null;
  const tractate = seg.track === 'mishnah' || seg.track === 'talmud';
  return {
    template: 'which-book',
    difficulty: locale === 'he' ? 'expert' : 'hard',
    text: tractate ? copy.whichTractate : copy.whichBook,
    ...opts,
    explanation: cap(copy.itIs(refLabel(seg, locale)), 600),
    sourceRef: seg.ref,
    evidenceQuote: cap(d.text, 400),
    evidenceLanguage: d.lang,
    context: { label: copy.labelExcerpt, text: cap(d.text, 2000), language: d.lang },
    optionsDirection: locale === 'he' ? 'rtl' : 'ltr',
    studyTextId: seg.id,
    versionTitle: d.versionTitle,
    license: d.license,
    machineTranslated: d.machine,
    fingerprint: `which-book|${locale}|${seg.ref}`,
  };
};

// ---------------------------------------------------------------------------
// Escolha do molde
// ---------------------------------------------------------------------------

/** Moldes de cada trilha, com os níveis em que cada um rende melhor. */
const PLAN: Readonly<Record<JourneyTrack, { builder: Builder; levels: readonly Difficulty[] }[]>> = {
  torah: [
    { builder: completeVerse, levels: ['easy', 'medium', 'hard', 'expert'] },
    { builder: whichFirst, levels: ['easy', 'medium', 'hard', 'expert'] },
    { builder: nextVerse, levels: ['medium', 'hard', 'expert'] },
    { builder: chapterOfVerse, levels: ['expert'] },
  ],
  commentators: [
    { builder: sourceVerse, levels: ['easy', 'medium', 'hard', 'expert'] },
    { builder: commentAuthor, levels: ['hard', 'expert'] },
  ],
  mishnah: [
    { builder: sourceVerse, levels: ['easy', 'medium', 'hard', 'expert'] },
    { builder: whichBook, levels: ['hard', 'expert'] },
  ],
  talmud: [
    { builder: sourceVerse, levels: ['easy', 'medium', 'hard', 'expert'] },
    { builder: whichBook, levels: ['hard', 'expert'] },
  ],
  midrash: [
    { builder: sourceVerse, levels: ['easy', 'medium', 'hard', 'expert'] },
    { builder: whichBook, levels: ['hard', 'expert'] },
  ],
  kabbalah: [{ builder: sourceVerse, levels: ['easy', 'medium', 'hard', 'expert'] }],
  mitzvot: [{ builder: sourceVerse, levels: ['easy', 'medium', 'hard', 'expert'] }],
};

/** Revisão da casa de estudos: inclui "em qual parashá?" além dos moldes da Torá. */
const REVIEW_PLAN: { builder: Builder; levels: readonly Difficulty[] }[] = [
  { builder: parashaOf, levels: ['easy', 'medium', 'hard', 'expert'] },
  ...PLAN.torah,
];

export function buildTemplateQuestion(
  track: JourneyTrack,
  input: TemplateInput,
  options: { review?: boolean; avoid?: (fingerprint: string) => boolean } = {},
): TemplateQuestion | null {
  const plan = options.review ? REVIEW_PLAN : PLAN[track];
  const fitting = plan.filter((p) => p.levels.includes(input.difficulty));
  const order = [...shuffle(input.rng, fitting), ...shuffle(input.rng, plan.filter((p) => !fitting.includes(p)))];
  for (const step of order) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const q = step.builder(input);
      if (!q) break;
      if (options.avoid?.(q.fingerprint)) continue;
      return q;
    }
  }
  return null;
}
