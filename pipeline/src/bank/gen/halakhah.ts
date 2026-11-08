/**
 * Halachá: o Mishné Torá do Rambam (em qual livro estão as leis, quantos capítulos têm, de
 * quais leis é a halachá) e o Shulchan Aruch (em qual parte e em qual seção está cada tema).
 * A divisão em livros e seções é a do Sefaria (pastas e estrutura "Topic").
 */
import type { Locale } from '@trivia/shared';
import { altTitle, OpeningIndex, type Corpus, type SchemaDoc, type Segment } from '../corpus.js';
import { distractors, nearNumbers, num, pairOf, perLocale, quoteFor, refKey, rngFor } from '../kit.js';
import type { Draft } from '../model.js';
import { MT_HILCHOT_PT, MT_SEFARIM, SA_PARTS, SA_TOPICS_PT } from '../names.js';

/** Leis de tema íntimo ou delicado: fora do banco (política de conteúdo, seção 2). */
const SENSITIVE_HILCHOT = new Set(['Forbidden Intercourse', 'Virgin Maiden', 'Woman Suspected of Infidelity', 'Slaves']);

interface Hilchot {
  title: string;
  short: string;
  sefer: string;
  order: number;
  he: string;
  pt: string;
}

function chapters(segments: readonly Segment[]): Map<number, Segment[]> {
  const m = new Map<number, Segment[]>();
  for (const s of segments) m.set(s.indices[0]! + 1, [...(m.get(s.indices[0]! + 1) ?? []), s]);
  return m;
}

export function halakhahGenerators(corpus: Corpus): Draft[] {
  const out: Draft[] = [];
  const base = { category: 'halakhah' as const, track: null, parashot: [] };

  // ------------------------------------------------------------------ Mishné Torá
  const hilchot: Hilchot[] = [];
  for (const title of corpus.titles()) {
    const cats = corpus.categoriesOf(title);
    if (cats[0] !== 'Halakhah' || cats[1] !== 'Mishneh Torah' || !MT_SEFARIM[cats[2] ?? '']) continue;
    const short = title.replace(/^Mishneh Torah, /, '');
    const pt = MT_HILCHOT_PT[short];
    if (!pt || SENSITIVE_HILCHOT.has(short) || !corpus.text(title, 'he')) continue;
    const s = corpus.schema<SchemaDoc>(title);
    hilchot.push({ title, short, sefer: cats[2]!, order: (s?.order?.[0] ?? 0) * 100 + (s?.order?.[1] ?? 0), he: (s?.heTitle ?? '').replace(/^משנה תורה,\s*/, ''), pt });
  }
  hilchot.sort((a, b) => a.order - b.order);
  const sefarim = Object.keys(MT_SEFARIM);
  const hname = (h: Hilchot, l: Locale) => (l === 'pt' ? h.pt : l === 'he' ? h.he : `Laws of ${h.short}`);
  const sname = (s: string, l: Locale) => MT_SEFARIM[s]![l];
  const mtLabel = (h: Hilchot, ch: number, x: number | null, l: Locale) =>
    `${l === 'he' ? 'רמב״ם, ' : l === 'pt' ? 'Rambam, ' : 'Rambam, '}${hname(h, l)} ${num(ch, l)}${x === null ? '' : `:${num(x, l)}`}`;
  const mtIndex = new OpeningIndex(hilchot.flatMap((h) => corpus.text(h.title, 'he')!.segments.map((s) => s.text)));

  for (const [i, h] of hilchot.entries()) {
    const text = corpus.text(h.title, 'he')!;
    const byCh = chapters(text.segments);
    const first = pairOf(corpus, h.title, `${h.title} 1:1`);
    if (!first) continue;
    const sameSefer = hilchot.filter((o) => o.sefer === h.sefer);

    // 1. Em qual livro do Mishné Torá estão estas leis.
    {
      const opts = [h.sefer, ...distractors(h.sefer, sefarim, rngFor(`mtsefer|${h.title}`))];
      out.push({
        id: `mt-sefer:${refKey(h.short)}`,
        ...base,
        difficulty: 'medium',
        kind: 'mt-sefer-of-hilchot',
        sourceRef: first.ref,
        i18n: perLocale((l) => ({
          text: { pt: `Em qual livro do Mishné Torá estão as ${hname(h, l)}?`, en: `Which book of the Mishneh Torah contains the ${hname(h, l)}?`, he: `באיזה ספר במשנה תורה נמצאות ${hname(h, l)}?` }[l],
          options: opts.map((s) => sname(s, l)),
          explanation: { pt: `As ${hname(h, l)} estão no ${sname(h.sefer, l)}.`, en: `The ${hname(h, l)} are in ${sname(h.sefer, l)}.`, he: `${hname(h, l)} נמצאות ב${sname(h.sefer, l)}.` }[l],
          evidence: quoteFor(first, l),
          context: null,
        })),
      });
    }

    // 2. Quantos capítulos.
    const lastCh = Math.max(...byCh.keys());
    const last = pairOf(corpus, h.title, `${h.title} ${lastCh}:1`);
    if (last && lastCh >= 3) {
      const opts = [lastCh, ...nearNumbers(lastCh, rngFor(`mtch|${h.title}`), lastCh > 15 ? 2 : 1)];
      out.push({
        id: `mt-chapters:${refKey(h.short)}`,
        ...base,
        difficulty: 'hard',
        kind: 'mt-chapter-count',
        sourceRef: last.ref,
        numeric: true,
        i18n: perLocale((l) => ({
          text: { pt: `No Mishné Torá, quantos capítulos têm as ${hname(h, l)}?`, en: `In the Mishneh Torah, how many chapters do the ${hname(h, l)} have?`, he: `כמה פרקים יש ב${hname(h, l)} במשנה תורה?` }[l],
          options: opts.map(String),
          explanation: { pt: `O último capítulo é ${mtLabel(h, lastCh, null, l)}.`, en: `The last chapter is ${mtLabel(h, lastCh, null, l)}.`, he: `הפרק האחרון הוא ${mtLabel(h, lastCh, null, l)}.` }[l],
          evidence: quoteFor(last, l),
          context: null,
        })),
      });
    }

    // 3. De quais leis é esta halachá (a 1ª de cada capítulo).
    for (const ch of byCh.keys()) {
      const p = pairOf(corpus, h.title, `${h.title} ${ch}:1`);
      if (!p) continue;
      const opening = mtIndex.unique(p.he.text, 4, 10);
      if (!opening) continue;
      const near = ch % 2 === 1;
      const pool = near && sameSefer.length >= 4 ? sameSefer : hilchot;
      const opts = [h, ...distractors(h, pool, rngFor(`mttext|${p.ref}`), near ? (o) => Math.abs(o.order - h.order) : undefined)];
      if (opts.length < 4) continue;
      out.push({
        id: `mt-text:${refKey(p.ref)}`,
        ...base,
        difficulty: near ? 'hard' : 'medium',
        kind: 'mt-hilchot-of-text',
        sourceRef: p.ref,
        i18n: perLocale((l) => ({
          text: { pt: 'Esta halachá do Rambam faz parte de quais leis?', en: 'This halakhah of the Rambam belongs to which laws?', he: 'ההלכה הזאת ברמב״ם שייכת לאילו הלכות?' }[l],
          options: opts.map((o) => hname(o, l)),
          explanation: { pt: `É ${mtLabel(h, ch, 1, l)}.`, en: `It is ${mtLabel(h, ch, 1, l)}.`, he: `זוהי ${mtLabel(h, ch, 1, l)}.` }[l],
          evidence: quoteFor(p, l, 10, 16, opening),
          context: { ...quoteFor(p, l, 10, 16, opening), label: { pt: 'A halachá', en: 'The halakhah', he: 'ההלכה' }[l] },
        })),
      });
    }

    // 4. Quais leis vêm depois (no mesmo livro).
    const next = hilchot[i + 1];
    if (next && next.sefer === h.sefer) {
      const np = pairOf(corpus, next.title, `${next.title} 1:1`);
      const opts = [next, ...distractors(next, hilchot.filter((o) => o !== h), rngFor(`mtnext|${h.title}`), (o) => Math.abs(o.order - next.order))];
      if (np && opts.length === 4) {
        out.push({
          id: `mt-next:${refKey(h.short)}`,
          ...base,
          difficulty: 'hard',
          kind: 'mt-next',
          sourceRef: np.ref,
          i18n: perLocale((l) => ({
            text: { pt: `No Mishné Torá, o que vem logo depois das ${hname(h, l)}?`, en: `In the Mishneh Torah, what comes right after the ${hname(h, l)}?`, he: `במשנה תורה, מה בא מיד אחרי ${hname(h, l)}?` }[l],
            options: opts.map((o) => hname(o, l)),
            explanation: { pt: `Depois vêm as ${hname(next, l)}, no mesmo ${sname(h.sefer, l)}.`, en: `Next come the ${hname(next, l)}, in the same ${sname(h.sefer, l)}.`, he: `אחריהן באות ${hname(next, l)}, באותו ${sname(h.sefer, l)}.` }[l],
            evidence: quoteFor(np, l),
            context: null,
          })),
        });
      }
    }
  }

  // ------------------------------------------------------------------ Shulchan Aruch
  interface Topic {
    part: (typeof SA_PARTS)[number];
    en: string;
    he: string;
    pt: string;
    from: number;
    to: number;
  }
  const topics: Topic[] = [];
  for (const part of SA_PARTS) {
    const nodes = corpus.schema<SchemaDoc>(part.title)?.alts?.['Topic']?.nodes ?? [];
    for (const n of nodes) {
      const en = altTitle(n, 'en').trim();
      const pt = SA_TOPICS_PT[en] ?? SA_TOPICS_PT[altTitle(n, 'en')];
      const m = /(\d+)(?::\d+)?(?:-(\d+))?/.exec((n.wholeRef ?? '').slice(part.title.length));
      if (!pt || !m) continue;
      topics.push({ part, en, he: altTitle(n, 'he'), pt, from: Number(m[1]), to: Number(m[2] ?? m[1]) });
    }
  }
  const tname = (t: Topic, l: Locale) => (l === 'pt' ? t.pt : l === 'he' ? t.he : t.en);
  const pname = (p: (typeof SA_PARTS)[number], l: Locale) => p.names[l];
  const saLabel = (p: (typeof SA_PARTS)[number], siman: number, seif: number | null, l: Locale) =>
    `${l === 'he' ? 'שולחן ערוך, ' : 'Shulchan Aruch, '}${pname(p, l)} ${num(siman, l)}${seif === null ? '' : `:${num(seif, l)}`}`;

  for (const t of topics) {
    const p = pairOf(corpus, t.part.title, `${t.part.title} ${t.from}:1`);
    if (!p) continue;
    // 5. Em qual parte do Shulchan Aruch está o tema.
    {
      const opts = [t.part, ...SA_PARTS.filter((x) => x !== t.part)];
      out.push({
        id: `sa-part:${refKey(t.part.title)}_${t.from}`,
        ...base,
        difficulty: ['Laws of Shabbat', 'Laws of Passover', 'Laws of Prayer', 'Meat with Milk', 'Laws of Chanukah', 'Laws of Purim', 'Laws of Tzitzit', 'Laws of Tefillin'].includes(t.en) ? 'easy' : 'medium',
        kind: 'sa-part-of-topic',
        sourceRef: p.ref,
        i18n: perLocale((l) => ({
          text: { pt: `Em qual parte do Shulchan Aruch está o tema “${tname(t, l)}”?`, en: `Which part of the Shulchan Arukh covers “${tname(t, l)}”?`, he: `באיזה חלק של השולחן ערוך נמצאות „${tname(t, l)}”?` }[l],
          options: opts.map((x) => pname(x, l)),
          explanation: { pt: `Está em ${pname(t.part, l)}, a partir do siman ${t.from}.`, en: `It is in ${pname(t.part, l)}, starting at siman ${t.from}.`, he: `הן נמצאות ב${pname(t.part, l)}, החל מסימן ${num(t.from, l)}.` }[l],
          evidence: quoteFor(p, l),
          context: null,
        })),
      });
    }
    // 6. O siman que abre o tema: de qual seção ele é. (Só o primeiro: no meio de uma seção
    //    longa o Sefaria às vezes agrupa assuntos vizinhos, e a pergunta tem de ser exata.)
    const sameTopics = topics.filter((x) => x.part === t.part);
    for (const siman of [t.from]) {
      const sp = pairOf(corpus, t.part.title, `${t.part.title} ${siman}:1`);
      if (!sp || sameTopics.length < 4) continue;
      const opts = [t, ...distractors(t, sameTopics, rngFor(`satopic|${t.part.title}|${siman}`), (o) => Math.abs(o.from - t.from))];
      out.push({
        id: `sa-topic:${refKey(t.part.title)}_${siman}`,
        ...base,
        difficulty: 'hard',
        kind: 'sa-topic-of-siman',
        sourceRef: sp.ref,
        i18n: perLocale((l) => ({
          text: { pt: `Qual seção começa no siman ${siman} de ${pname(t.part, l)}?`, en: `Which section begins at siman ${siman} of ${pname(t.part, l)}?`, he: `איזה חלק מתחיל בסימן ${num(siman, l)} ב${pname(t.part, l)}?` }[l],
          options: opts.map((o) => tname(o, l)),
          explanation: { pt: `O siman ${siman} abre a seção “${tname(t, l)}”.`, en: `Siman ${siman} opens the section “${tname(t, l)}”.`, he: `סימן ${num(siman, l)} פותח את „${tname(t, l)}”.` }[l],
          evidence: quoteFor(sp, l),
          context: null,
        })),
      });
    }
  }

  // 7. Em qual parte está este seif (a abertura de alguns simanim, só dos temas listados).
  const saIndex = new OpeningIndex(SA_PARTS.flatMap((p) => corpus.text(p.title, 'he')?.segments.map((s) => s.text) ?? []));
  for (const t of topics) {
    for (let siman = t.from; siman <= t.to; siman += 2) {
      const p = pairOf(corpus, t.part.title, `${t.part.title} ${siman}:1`);
      if (!p) continue;
      const opening = saIndex.unique(p.he.text, 5, 10);
      if (!opening) continue;
      const opts = [t.part, ...SA_PARTS.filter((x) => x !== t.part)];
      out.push({
        id: `sa-seif:${refKey(t.part.title)}_${siman}`,
        ...base,
        difficulty: 'expert',
        kind: 'sa-part-of-seif',
        sourceRef: p.ref,
        i18n: perLocale((l) => ({
          text: { pt: 'Em qual parte do Shulchan Aruch está este seif?', en: 'Which part of the Shulchan Arukh is this se’if from?', he: 'באיזה חלק של השולחן ערוך נמצא הסעיף הזה?' }[l],
          options: opts.map((x) => pname(x, l)),
          explanation: { pt: `É ${saLabel(t.part, siman, 1, l)}, na seção “${tname(t, l)}”.`, en: `It is ${saLabel(t.part, siman, 1, l)}, in the section “${tname(t, l)}”.`, he: `זהו ${saLabel(t.part, siman, 1, l)}, ב„${tname(t, l)}”.` }[l],
          evidence: quoteFor(p, l, 10, 16, opening),
          context: { ...quoteFor(p, l, 10, 16, opening), label: { pt: 'O seif', en: 'The se’if', he: 'הסעיף' }[l] },
        })),
      });
    }
  }
  return out;
}
