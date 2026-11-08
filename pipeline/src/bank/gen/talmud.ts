/**
 * Talmud Bavli: os capítulos (perakim) de cada tratado pelo nome tradicional, a ordem de
 * cada tratado, do que trata, em que daf termina e de qual tratado é um trecho da Guemará.
 * Os nomes dos capítulos e onde cada um começa vêm da estrutura "Chapters" do Sefaria.
 */
import { hebrewNumeral, type Locale } from '@trivia/shared';
import { altTitle, OpeningIndex, type Corpus, type SchemaDoc } from '../corpus.js';
import { distractors, nearNumbers, num, pairOf, perLocale, quoteFor, refKey, rngFor } from '../kit.js';
import type { Draft } from '../model.js';
import { SEDARIM, TRACTATE_TOPIC_PT } from '../names.js';
import { SENSITIVE_TRACTATES } from './mishnah.js';

interface Perek {
  n: number;
  en: string;
  he: string;
  start: string;
  end: string;
}

interface Bavli {
  title: string;
  seder: string;
  order: number;
  he: string;
  amudim: number;
  perakim: Perek[];
  enDesc: string;
  heDesc: string;
}

/** "Chapter 1; MeEimatai" → "MeEimatai". */
function perekTranslit(en: string): string {
  return en.includes(';') ? en.slice(en.indexOf(';') + 1).trim() : en.trim();
}

function tractates(corpus: Corpus): Bavli[] {
  const out: Bavli[] = [];
  for (const title of corpus.titles()) {
    const cats = corpus.categoriesOf(title);
    if (cats[0] !== 'Talmud' || cats[1] !== 'Bavli' || !cats[2]?.startsWith('Seder ')) continue;
    const s = corpus.schema<SchemaDoc>(title);
    const nodes = s?.alts?.['Chapters']?.nodes;
    if (!s?.schema?.lengths || !nodes?.length) continue;
    const perakim = nodes
      .map((node, i) => {
        const [start, end] = (node.wholeRef ?? '').split('-');
        return { n: i + 1, en: perekTranslit(altTitle(node, 'en')), he: altTitle(node, 'he'), start: start ?? '', end: end ?? '' };
      })
      .filter((p) => p.start && p.en && p.he);
    out.push({ title, seder: cats[2], order: s.order?.[0] ?? 999, he: s.heTitle ?? title, amudim: s.schema.lengths[0]!, perakim, enDesc: s.enShortDesc ?? '', heDesc: s.heShortDesc ?? '' });
  }
  return out.sort((a, b) => a.order - b.order);
}

/** Índice do amud (2a = 2) → "64a". */
function dafOf(index: number): string {
  return `${Math.floor(index / 2) + 1}${index % 2 === 0 ? 'a' : 'b'}`;
}

export function talmudGenerators(corpus: Corpus): Draft[] {
  const out: Draft[] = [];
  const all = tractates(corpus).filter((t) => corpus.text(t.title, 'he'));
  const tname = (t: Bavli, l: Locale) => (l === 'he' ? t.he : t.title);
  const sederName = (id: string, l: Locale) => SEDARIM.find((s) => s.id === id)!.names[l];
  const pname = (p: Perek, l: Locale) => (l === 'he' ? p.he : p.en);
  const base = { category: 'talmud' as const, track: null, parashot: [] };
  const nameCount = new Map<string, number>();
  for (const t of all) for (const p of t.perakim) nameCount.set(p.he, (nameCount.get(p.he) ?? 0) + 1);
  const index = new OpeningIndex(all.flatMap((t) => corpus.text(t.title, 'he')!.segments.map((s) => s.text)));
  /** "Berakhot 2a:5" no idioma; em hebraico, "ברכות דף ב׳ ע״א". */
  const gLabel = (t: Bavli, ref: string, l: Locale) => {
    const addr = ref.slice(t.title.length + 1);
    if (l !== 'he') return `${tname(t, l)} ${addr}`;
    const m = /^(\d+)([ab])/.exec(addr);
    return m ? `${tname(t, l)} דף ${hebrewNumeral(Number(m[1]))} ע״${m[2] === 'a' ? 'א' : 'ב'}` : `${tname(t, l)} ${addr}`;
  };

  for (const t of all) {
    const text = corpus.text(t.title, 'he')!;
    const sameSeder = all.filter((o) => o.seder === t.seder);
    const first = pairOf(corpus, t.title, text.segments[0]!.ref);
    if (!first) continue;

    for (const p of t.perakim) {
      const start = pairOf(corpus, t.title, p.start);
      if (!start) continue;
      const unique = nameCount.get(p.he) === 1;
      const sensitive = SENSITIVE_TRACTATES.has(t.title);

      // 1. Em qual tratado está o capítulo (nome tradicional).
      if (unique && !sensitive) {
        const near = p.n > 1;
        const opts = [t, ...distractors(t, (near ? sameSeder : all).filter((o) => !SENSITIVE_TRACTATES.has(o.title)), rngFor(`perek|${t.title}|${p.n}`), near ? (o) => Math.abs(o.order - t.order) : undefined)];
        if (opts.length === 4) {
          out.push({
            id: `talmud-perek:${refKey(t.title)}_${p.n}`,
            ...base,
            difficulty: near ? 'hard' : 'medium',
            kind: 'talmud-perek-tractate',
            sourceRef: start.ref,
            i18n: perLocale((l) => ({
              text: { pt: `Em qual tratado do Talmud está o capítulo “${pname(p, l)}”?`, en: `Which tractate of the Talmud has the chapter “${pname(p, l)}”?`, he: `באיזו מסכת בתלמוד נמצא פרק „${pname(p, l)}”?` }[l],
              options: opts.map((o) => tname(o, l)),
              explanation: {
                pt: `“${pname(p, l)}” é o capítulo ${p.n} de ${tname(t, l)} e começa em ${gLabel(t, p.start, l)}.`,
                en: `“${pname(p, l)}” is chapter ${p.n} of ${tname(t, l)}, beginning at ${gLabel(t, p.start, l)}.`,
                he: `„${pname(p, l)}” הוא פרק ${num(p.n, l)} במסכת ${tname(t, l)}, ומתחיל ב${gLabel(t, p.start, l)}.`,
              }[l],
              evidence: quoteFor(start, l, 8, 14),
              context: null,
            })),
          });
        }
      }

      // 2. Qual é o número do capítulo dentro do tratado.
      if (t.perakim.length >= 4) {
        const opts = [p.n, ...nearNumbers(p.n, rngFor(`perekn|${t.title}|${p.n}`)).filter((n) => n <= t.perakim.length)];
        if (opts.length === 4) {
          out.push({
            id: `talmud-perek-number:${refKey(t.title)}_${p.n}`,
            ...base,
            difficulty: p.n === 1 ? 'medium' : 'expert',
            kind: 'talmud-perek-number',
            sourceRef: start.ref,
            numeric: true,
            i18n: perLocale((l) => ({
              text: { pt: `Em ${tname(t, l)}, o capítulo “${pname(p, l)}” é o de número…`, en: `In ${tname(t, l)}, the chapter “${pname(p, l)}” is number…`, he: `במסכת ${tname(t, l)}, פרק „${pname(p, l)}” הוא פרק מספר…` }[l],
              options: opts.map((n) => num(n, l === 'he' ? 'pt' : l)),
              explanation: { pt: `É o capítulo ${p.n}, que começa em ${gLabel(t, p.start, l)}.`, en: `It is chapter ${p.n}, beginning at ${gLabel(t, p.start, l)}.`, he: `זהו פרק ${num(p.n, l)}, שמתחיל ב${gLabel(t, p.start, l)}.` }[l],
              evidence: quoteFor(start, l, 8, 14),
              context: null,
            })),
          });
        }
      }

      // 3. De qual tratado é este trecho da Guemará (do meio do capítulo).
      if (!sensitive) {
        const segs = text.segments;
        const startIdx = segs.findIndex((s) => s.ref === p.start);
        const endIdx = p.end ? segs.findIndex((s) => s.ref === `${t.title} ${p.end}`) : -1;
        if (startIdx >= 0 && endIdx > startIdx + 6) {
          for (const [k, frac] of [0.34, 0.67].entries()) {
            const mid = segs[Math.floor(startIdx + (endIdx - startIdx) * frac)]!;
            const pair = pairOf(corpus, t.title, mid.ref);
            const opening = pair ? index.unique(pair.he.text, 5, 10) : null;
            if (!pair || !opening) continue;
            const near = k === 1;
            const pool = (near ? sameSeder : all).filter((o) => !SENSITIVE_TRACTATES.has(o.title));
            const opts = [t, ...distractors(t, pool, rngFor(`gtext|${mid.ref}`), near ? (o) => Math.abs(o.order - t.order) : undefined)];
            if (opts.length < 4) continue;
            out.push({
              id: `talmud-text:${refKey(mid.ref)}`,
              ...base,
              difficulty: near ? 'expert' : 'hard',
              kind: 'talmud-tractate-of-text',
              sourceRef: mid.ref,
              i18n: perLocale((l) => ({
                text: { pt: 'De qual tratado é este trecho da Guemará?', en: 'Which tractate is this passage of the Gemara from?', he: 'מאיזו מסכת הקטע הזה מהגמרא?' }[l],
                options: opts.map((o) => tname(o, l)),
                explanation: { pt: `É ${gLabel(t, mid.ref, l)}, no capítulo “${pname(p, l)}”.`, en: `It is ${gLabel(t, mid.ref, l)}, in the chapter “${pname(p, l)}”.`, he: `זהו ${gLabel(t, mid.ref, l)}, בפרק „${pname(p, l)}”.` }[l],
                evidence: quoteFor(pair, l, 10, 16, opening),
                context: { ...quoteFor(pair, l, 10, 16, opening), label: { pt: 'A Guemará', en: 'The Gemara', he: 'הגמרא' }[l] },
              })),
            });
          }
        }
      }
    }

    // 4. Em qual ordem está o tratado.
    {
      const opts = [t.seder, ...distractors(t.seder, SEDARIM.map((s) => s.id), rngFor(`bseder|${t.title}`))];
      out.push({
        id: `talmud-seder:${refKey(t.title)}`,
        ...base,
        difficulty: ['Berakhot', 'Shabbat', 'Pesachim', 'Bava Kamma', 'Sukkah', 'Yoma', 'Megillah'].includes(t.title) ? 'easy' : 'medium',
        kind: 'talmud-seder-of-tractate',
        sourceRef: first.ref,
        i18n: perLocale((l) => ({
          text: { pt: `Em qual ordem (seder) está o tratado ${tname(t, l)} do Talmud?`, en: `In which order (seder) is tractate ${tname(t, l)} of the Talmud?`, he: `באיזה סדר נמצאת מסכת ${tname(t, l)} בתלמוד?` }[l],
          options: opts.map((s) => sederName(s, l)),
          explanation: { pt: `${tname(t, l)} faz parte da ordem ${sederName(t.seder, l)}.`, en: `${tname(t, l)} belongs to the order ${sederName(t.seder, l)}.`, he: `מסכת ${tname(t, l)} שייכת ל${sederName(t.seder, l)}.` }[l],
          evidence: quoteFor(first, l),
          context: null,
        })),
      });
    }

    // 5. Do que trata o tratado.
    const topicPt = TRACTATE_TOPIC_PT[t.title];
    if (topicPt && t.enDesc && t.heDesc && !SENSITIVE_TRACTATES.has(t.title)) {
      const opts = [t, ...distractors(t, all.filter((o) => !SENSITIVE_TRACTATES.has(o.title)), rngFor(`btopic|${t.title}`), (o) => Math.abs(o.order - t.order))];
      const desc = { pt: topicPt, en: t.enDesc, he: t.heDesc };
      out.push({
        id: `talmud-topic:${refKey(t.title)}`,
        ...base,
        difficulty: 'medium',
        kind: 'talmud-topic',
        sourceRef: first.ref,
        i18n: perLocale((l) => ({
          text: { pt: `Qual tratado do Talmud trata deste tema: “${desc.pt}”`, en: `Which tractate of the Talmud covers this subject: “${desc.en}”`, he: `איזו מסכת בתלמוד עוסקת בנושא הזה: „${desc.he}”` }[l],
          options: opts.map((o) => tname(o, l)),
          explanation: { pt: `É ${tname(t, l)}, que começa assim:`, en: `It is ${tname(t, l)}, which opens like this:`, he: `זוהי מסכת ${tname(t, l)}, שפותחת כך:` }[l],
          evidence: quoteFor(first, l),
          context: null,
        })),
      });
    }

    // 6. Em qual daf termina o tratado.
    const lastSeg = text.segments.at(-1)!;
    const lastIdx = lastSeg.indices[0]!;
    const lastPair = pairOf(corpus, t.title, lastSeg.ref);
    const lastDaf = Math.floor(lastIdx / 2) + 1;
    if (lastPair && lastDaf > 6) {
      const opts = [lastDaf, ...nearNumbers(lastDaf, rngFor(`daf|${t.title}`), Math.max(1, Math.round(lastDaf / 15)))];
      out.push({
        id: `talmud-last-daf:${refKey(t.title)}`,
        ...base,
        difficulty: 'expert',
        kind: 'talmud-last-daf',
        sourceRef: lastPair.ref,
        numeric: true,
        i18n: perLocale((l) => ({
          text: { pt: `O tratado ${tname(t, l)} termina em qual daf (folha)?`, en: `Tractate ${tname(t, l)} ends on which daf (folio)?`, he: `באיזה דף מסתיימת מסכת ${tname(t, l)}?` }[l],
          options: opts.map(String),
          explanation: { pt: `Termina no daf ${dafOf(lastIdx)}.`, en: `It ends on daf ${dafOf(lastIdx)}.`, he: `היא מסתיימת ב${gLabel(t, lastSeg.ref, l)}.` }[l],
          evidence: quoteFor(lastPair, l),
          context: null,
        })),
      });
    }
  }
  return out;
}
