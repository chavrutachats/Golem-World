/**
 * Mishná: de qual tratado é a mishná, em qual ordem (seder) fica cada tratado, do que trata
 * cada um, quantos capítulos tem e a ordem dos tratados. A estrutura e os resumos vêm dos
 * schemas do Sefaria; o trecho mostrado é a abertura que só aquela mishná tem.
 */
import type { Locale } from '@trivia/shared';
import { OpeningIndex, type Corpus, type SchemaDoc, type Segment } from '../corpus.js';
import { distractors, nearNumbers, num, pairOf, perLocale, quoteFor, refKey, rngFor } from '../kit.js';
import type { Draft } from '../model.js';
import { SEDARIM, TRACTATE_TOPIC_PT } from '../names.js';

/** Tratados de tema íntimo: ficam fora das perguntas com trecho (política de conteúdo, seção 2). */
export const SENSITIVE_TRACTATES = new Set(['Niddah', 'Zavim', 'Sotah', 'Yevamot']);

export interface Tractate {
  title: string;
  short: string;
  seder: string;
  order: number;
  he: string;
  chapters: number;
  enDesc: string;
  heDesc: string;
}

export function mishnahTractates(corpus: Corpus): Tractate[] {
  const out: Tractate[] = [];
  for (const title of corpus.titles()) {
    const cats = corpus.categoriesOf(title);
    if (cats[0] !== 'Mishnah' || !cats[1]?.startsWith('Seder ')) continue;
    const s = corpus.schema<SchemaDoc>(title);
    const text = corpus.text(title, 'he');
    if (!s || !text) continue;
    const short = title === 'Pirkei Avot' ? 'Avot' : title.replace(/^Mishnah /, '');
    out.push({
      title,
      short,
      seder: cats[1],
      order: s.order?.[0] ?? 999,
      he: title === 'Pirkei Avot' ? 'פרקי אבות' : (s.heTitle ?? '').replace(/^משנה\s+/, ''),
      chapters: s.schema?.lengths?.[0] ?? Math.max(...text.segments.map((x) => x.indices[0]! + 1)),
      enDesc: s.enShortDesc ?? '',
      heDesc: s.heShortDesc ?? '',
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

export function tractateName(t: Pick<Tractate, 'title' | 'short' | 'he'>, l: Locale): string {
  if (t.title === 'Pirkei Avot') return { pt: 'Pirkê Avot', en: 'Pirkei Avot', he: 'פרקי אבות' }[l];
  return l === 'he' ? t.he : t.short;
}

export function mishnahGenerators(corpus: Corpus): Draft[] {
  const out: Draft[] = [];
  const tractates = mishnahTractates(corpus);
  const sederName = (id: string, l: Locale) => SEDARIM.find((s) => s.id === id)!.names[l];
  const base = { category: 'mishnah' as const, track: null, parashot: [] };
  const index = new OpeningIndex(tractates.flatMap((t) => corpus.text(t.title, 'he')?.segments.map((s) => s.text) ?? []));
  const mLabel = (t: Tractate, ch: number, m: number | null, l: Locale) =>
    `${l === 'he' ? 'משנה ' : l === 'pt' ? 'Mishná ' : 'Mishnah '}${tractateName(t, l)} ${num(ch, l)}${m === null ? '' : `:${num(m, l)}`}`;

  for (const [i, t] of tractates.entries()) {
    const text = corpus.text(t.title, 'he');
    if (!text) continue;
    const byChapter = new Map<number, Segment[]>();
    for (const s of text.segments) byChapter.set(s.indices[0]! + 1, [...(byChapter.get(s.indices[0]! + 1) ?? []), s]);
    const sameSeder = tractates.filter((o) => o.seder === t.seder);

    // 1. De qual tratado é a mishná (a 1ª e a do meio de cada capítulo).
    if (!SENSITIVE_TRACTATES.has(t.short)) {
      for (const [ch, segs] of byChapter) {
        for (const which of ['first', 'middle'] as const) {
          const m = which === 'first' ? 1 : Math.ceil((segs.length + 1) / 2);
          if (which === 'middle' && m === 1) continue;
          const p = pairOf(corpus, t.title, `${t.title} ${ch}:${m}`);
          if (!p) continue;
          const opening = index.unique(p.he.text, 4, 10);
          if (!opening) continue;
          const near = which === 'first';
          const pool = (near ? sameSeder : tractates).filter((o) => !SENSITIVE_TRACTATES.has(o.short));
          const opts = [t, ...distractors(t, pool, rngFor(`mtext|${p.ref}`), near ? (o) => Math.abs(o.order - t.order) : undefined)];
          if (opts.length < 4) continue;
          out.push({
            id: `mishnah-text:${refKey(p.ref)}`,
            ...base,
            difficulty: near ? 'hard' : 'medium',
            kind: 'mishnah-tractate-of-text',
            sourceRef: p.ref,
            i18n: perLocale((l) => ({
              text: { pt: 'De qual tratado é esta mishná?', en: 'Which tractate is this mishnah from?', he: 'מאיזו מסכת המשנה הזאת?' }[l],
              options: opts.map((o) => tractateName(o, l)),
              explanation: { pt: `É ${mLabel(t, ch, m, l)}, na ordem ${sederName(t.seder, l)}.`, en: `It is ${mLabel(t, ch, m, l)}, in the order ${sederName(t.seder, l)}.`, he: `זוהי ${mLabel(t, ch, m, l)}, ב${sederName(t.seder, l)}.` }[l],
              evidence: quoteFor(p, l, 10, 16, opening),
              context: { ...quoteFor(p, l, 10, 16, opening), label: { pt: 'A mishná', en: 'The mishnah', he: 'המשנה' }[l] },
            })),
          });
        }
      }
    }

    const first = pairOf(corpus, t.title, `${t.title} 1:1`);
    if (!first) continue;

    // 2. Em qual ordem (seder) está o tratado.
    {
      const opts = [t.seder, ...distractors(t.seder, SEDARIM.map((s) => s.id), rngFor(`seder|${t.title}`))];
      out.push({
        id: `mishnah-seder:${refKey(t.title)}`,
        ...base,
        difficulty: ['Berakhot', 'Shabbat', 'Pesachim', 'Bava Kamma', 'Avot', 'Sukkah', 'Yoma'].includes(t.short) ? 'easy' : 'medium',
        kind: 'mishnah-seder-of-tractate',
        sourceRef: first.ref,
        i18n: perLocale((l) => ({
          text: { pt: `Em qual ordem (seder) da Mishná está o tratado ${tractateName(t, l)}?`, en: `In which order (seder) of the Mishnah is tractate ${tractateName(t, l)}?`, he: `באיזה סדר של המשנה נמצאת מסכת ${tractateName(t, l)}?` }[l],
          options: opts.map((s) => sederName(s, l)),
          explanation: { pt: `${tractateName(t, l)} faz parte da ordem ${sederName(t.seder, l)}.`, en: `${tractateName(t, l)} belongs to the order ${sederName(t.seder, l)}.`, he: `מסכת ${tractateName(t, l)} שייכת ל${sederName(t.seder, l)}.` }[l],
          evidence: quoteFor(first, l),
          context: null,
        })),
      });
    }

    // 3. Do que trata o tratado (resumo do Sefaria).
    const topicPt = TRACTATE_TOPIC_PT[t.short === 'Avot' ? 'Pirkei Avot' : t.short];
    if (topicPt && t.enDesc && t.heDesc && !SENSITIVE_TRACTATES.has(t.short)) {
      const pool = sameSeder.length >= 4 ? sameSeder : tractates;
      const opts = [t, ...distractors(t, pool.filter((o) => !SENSITIVE_TRACTATES.has(o.short)), rngFor(`topic|${t.title}`))];
      if (opts.length === 4) {
        const desc = { pt: topicPt, en: t.enDesc, he: t.heDesc };
        out.push({
          id: `mishnah-topic:${refKey(t.title)}`,
          ...base,
          difficulty: 'medium',
          kind: 'mishnah-topic',
          sourceRef: first.ref,
          i18n: perLocale((l) => ({
            text: { pt: `Qual tratado trata deste tema: “${desc.pt}”`, en: `Which tractate covers this subject: “${desc.en}”`, he: `איזו מסכת עוסקת בנושא הזה: „${desc.he}”` }[l],
            options: opts.map((o) => tractateName(o, l)),
            explanation: { pt: `É o tratado ${tractateName(t, l)}, que começa assim:`, en: `It is tractate ${tractateName(t, l)}, which opens like this:`, he: `זוהי מסכת ${tractateName(t, l)}, שפותחת כך:` }[l],
            evidence: quoteFor(first, l),
            context: null,
          })),
        });
      }
    }

    // 4. Quantos capítulos tem o tratado.
    const lastCh = Math.max(...byChapter.keys());
    const last = pairOf(corpus, t.title, `${t.title} ${lastCh}:1`);
    if (last) {
      const opts = [lastCh, ...nearNumbers(lastCh, rngFor(`mch|${t.title}`), lastCh > 15 ? 2 : 1)];
      out.push({
        id: `mishnah-chapters:${refKey(t.title)}`,
        ...base,
        difficulty: 'hard',
        kind: 'mishnah-chapter-count',
        sourceRef: last.ref,
        numeric: true,
        i18n: perLocale((l) => ({
          text: { pt: `Quantos capítulos tem o tratado ${tractateName(t, l)} da Mishná?`, en: `How many chapters does Mishnah ${tractateName(t, l)} have?`, he: `כמה פרקים יש במסכת ${tractateName(t, l)} במשנה?` }[l],
          options: opts.map(String),
          explanation: { pt: `O último capítulo é ${mLabel(t, lastCh, null, l)}.`, en: `The last chapter is ${mLabel(t, lastCh, null, l)}.`, he: `הפרק האחרון הוא ${mLabel(t, lastCh, null, l)}.` }[l],
          evidence: quoteFor(last, l),
          context: null,
        })),
      });
    }

    // 5. Qual tratado vem depois (na mesma ordem).
    const next = tractates[i + 1];
    if (next && next.seder === t.seder) {
      const np = pairOf(corpus, next.title, `${next.title} 1:1`);
      const opts = [next, ...distractors(next, tractates.filter((o) => o !== t), rngFor(`mnext|${t.title}`), (o) => Math.abs(o.order - next.order) + (o.seder === t.seder ? 0 : 5))];
      if (np && opts.length === 4) {
        out.push({
          id: `mishnah-next:${refKey(t.title)}`,
          ...base,
          difficulty: 'medium',
          kind: 'mishnah-next',
          sourceRef: np.ref,
          i18n: perLocale((l) => ({
            text: { pt: `Na ordem ${sederName(t.seder, l)}, qual tratado vem logo depois de ${tractateName(t, l)}?`, en: `In the order ${sederName(t.seder, l)}, which tractate comes right after ${tractateName(t, l)}?`, he: `ב${sederName(t.seder, l)}, איזו מסכת באה מיד אחרי ${tractateName(t, l)}?` }[l],
            options: opts.map((o) => tractateName(o, l)),
            explanation: { pt: `Depois de ${tractateName(t, l)} vem ${tractateName(next, l)}, na ordem do Sefaria.`, en: `After ${tractateName(t, l)} comes ${tractateName(next, l)}, in Sefaria's order.`, he: `אחרי מסכת ${tractateName(t, l)} באה מסכת ${tractateName(next, l)}, לפי הסדר בספריא.` }[l],
            evidence: quoteFor(np, l),
            context: null,
          })),
        });
      }
    }
  }
  return out;
}
