/**
 * Midrash e Agadá: de qual obra é o trecho (Midrash Rabá, Tanchuma, Pirkê de Rabi
 * Eliézer), qual livro do Tanach cada Midrash Rabá comenta, qual parashá um capítulo do
 * Midrash Rabá comenta e em qual parashá do Tanchuma está um trecho. As perguntas presas a
 * uma parashá também valem para a trilha de Midrash do Golem World.
 */
import { PARASHOT, parashaName, torahBookName, isTorahBook, type Locale, type ParashaDef } from '@trivia/shared';
import { OpeningIndex, type Corpus, type SchemaDoc, type Segment } from '../corpus.js';
import { distractors, num, pairOf, perLocale, quoteFor, refKey, rngFor } from '../kit.js';
import type { Draft } from '../model.js';
import { NACH_PT, RABBAH, type Names } from '../names.js';

interface Work {
  title: string;
  names: Names;
  /** Rabá: o livro do Tanach que comenta. */
  on?: string;
}

const WORKS: readonly Work[] = [
  ...RABBAH,
  { title: 'Midrash Tanchuma', names: { pt: 'Midrash Tanchuma', en: 'Midrash Tanchuma', he: 'מדרש תנחומא' } },
  { title: 'Pirkei DeRabbi Eliezer', names: { pt: 'Pirkê de Rabi Eliézer', en: 'Pirkei DeRabbi Eliezer', he: 'פרקי דרבי אליעזר' } },
];

export interface MidrashContext {
  /** Parashiot de cada trecho do Midrash Rabá (StudyText do Golem World, vindas das conexões do Sefaria). */
  parashotByRef?: ReadonlyMap<string, readonly string[]>;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

function parashaOfNode(node: string): ParashaDef | undefined {
  return PARASHOT.find((p) => norm(parashaName(p, 'en')) === norm(node) || norm(p.namePt) === norm(node));
}

export function midrashGenerators(corpus: Corpus, ctx: MidrashContext = {}): Draft[] {
  const out: Draft[] = [];
  const works = WORKS.filter((w) => corpus.text(w.title, 'he'));
  const wname = (w: Work, l: Locale) => w.names[l];
  const index = new OpeningIndex(works.flatMap((w) => corpus.text(w.title, 'he')!.segments.map((s) => s.text)));
  const bookName = (b: string, l: Locale) =>
    isTorahBook(b) ? torahBookName(b, l) : l === 'pt' ? NACH_PT[b]! : l === 'he' ? (corpus.schema<SchemaDoc>(b)?.heTitle ?? b) : b;
  const label = (ref: string, l: Locale, w: Work) => `${wname(w, l)} ${ref.slice(w.title.length).replace(/^,?\s*/, '')}`;
  const base = { category: 'midrash_aggadah' as const };

  for (const w of works) {
    const text = corpus.text(w.title, 'he')!;
    // Agrupa por "capítulo": o nó (Tanchuma) ou o primeiro índice (os demais).
    const groups = new Map<string, Segment[]>();
    for (const s of text.segments) {
      const key = `${s.node ?? ''}|${s.indices[0]}`;
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    const rabbahIdx = RABBAH.findIndex((r) => r.title === w.title);

    // 1. De qual obra é o trecho.
    for (const segs of groups.values()) {
      for (const which of ['first', 'middle'] as const) {
        const seg = which === 'first' ? segs[0]! : segs[Math.floor(segs.length / 2)]!;
        if (which === 'middle' && seg === segs[0]) continue;
        const p = pairOf(corpus, w.title, seg.ref);
        const opening = p ? index.unique(p.he.text, 5, 10) : null;
        if (!p || !opening) continue;
        const near = which === 'first';
        const opts = [w, ...distractors(w, works, rngFor(`mtext|${seg.ref}`), near && rabbahIdx >= 0 ? (o) => Math.abs(RABBAH.findIndex((r) => r.title === o.title) - rabbahIdx) + (RABBAH.some((r) => r.title === o.title) ? 0 : 20) : undefined)];
        if (opts.length < 4) continue;
        const parasha = seg.node ? parashaOfNode(seg.node) : undefined;
        const ps = parasha ? [parasha.id] : [...(ctx.parashotByRef?.get(seg.ref) ?? [])];
        out.push({
          id: `midrash-text:${refKey(seg.ref)}`,
          ...base,
          track: ps.length ? 'midrash' : null,
          parashot: ps,
          difficulty: near ? 'hard' : 'medium',
          kind: 'midrash-work-of-text',
          sourceRef: p.ref,
          i18n: perLocale((l) => ({
            text: { pt: 'De qual obra do Midrash é este trecho?', en: 'Which work of Midrash is this passage from?', he: 'מאיזה ספר מדרש הקטע הזה?' }[l],
            options: opts.map((o) => wname(o, l)),
            explanation: { pt: `É ${label(seg.ref, l, w)}.`, en: `It is ${label(seg.ref, l, w)}.`, he: `זהו ${label(seg.ref, l, w)}.` }[l],
            evidence: quoteFor(p, l, 10, 16, opening),
            context: { ...quoteFor(p, l, 10, 16, opening), label: { pt: 'O midrash', en: 'The midrash', he: 'המדרש' }[l] },
          })),
        });
      }
    }

    // 2. Qual livro cada Midrash Rabá comenta.
    if (w.on) {
      const first = pairOf(corpus, w.title, text.segments[0]!.ref);
      const books = RABBAH.map((r) => r.on);
      if (first) {
        const opts = [w.on, ...distractors(w.on, books, rngFor(`rabbah|${w.title}`))];
        out.push({
          id: `midrash-rabbah-book:${refKey(w.title)}`,
          ...base,
          track: null,
          parashot: [],
          difficulty: 'easy',
          kind: 'midrash-rabbah-book',
          sourceRef: first.ref,
          i18n: perLocale((l) => ({
            text: { pt: `${wname(w, l)} é um midrash sobre qual livro do Tanach?`, en: `${wname(w, l)} is a midrash on which book of the Tanakh?`, he: `${wname(w, l)} הוא מדרש על איזה ספר בתנ״ך?` }[l],
            options: opts.map((b) => bookName(b, l)),
            explanation: { pt: `${wname(w, l)} comenta ${bookName(w.on!, l)}.`, en: `${wname(w, l)} comments on ${bookName(w.on!, l)}.`, he: `${wname(w, l)} מפרש את ${bookName(w.on!, l)}.` }[l],
            evidence: quoteFor(first, l),
            context: null,
          })),
        });
      }
    }

    // 3. Qual parashá cada capítulo do Midrash Rabá (sobre a Torá) comenta.
    if (w.on && isTorahBook(w.on) && ctx.parashotByRef) {
      for (const segs of groups.values()) {
        const tally = new Map<string, number>();
        for (const s of segs) for (const id of ctx.parashotByRef.get(s.ref) ?? []) tally.set(id, (tally.get(id) ?? 0) + 1);
        const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
        // Só quando o capítulo é claramente de uma parashá (2/3 dos trechos ligados).
        const linked = segs.filter((s) => ctx.parashotByRef!.get(s.ref)?.length).length;
        if (!best || linked < 2 || best[1] < linked * 0.67) continue;
        const parasha = PARASHOT.find((p) => p.id === best[0]);
        const p = pairOf(corpus, w.title, segs[0]!.ref);
        if (!parasha || !p) continue;
        const chapter = segs[0]!.indices[0]! + 1;
        const opts = [parasha, ...distractors(parasha, PARASHOT.filter((x) => x.book === parasha.book), rngFor(`rparasha|${w.title}|${chapter}`), (o) => Math.abs(o.number - parasha.number))];
        if (opts.length < 4) continue;
        out.push({
          id: `midrash-rabbah-parasha:${refKey(w.title)}_${chapter}`,
          ...base,
          track: 'midrash',
          parashot: [parasha.id],
          difficulty: 'hard',
          kind: 'midrash-rabbah-parasha',
          sourceRef: p.ref,
          i18n: perLocale((l) => ({
            text: { pt: `O capítulo ${chapter} de ${wname(w, l)} comenta qual parashá?`, en: `Chapter ${chapter} of ${wname(w, l)} comments on which parashah?`, he: `פרשה ${num(chapter, l)} ב${wname(w, l)} מפרשת איזו פרשה בתורה?` }[l],
            options: opts.map((o) => parashaName(o, l)),
            explanation: {
              pt: `Os trechos desse capítulo explicam versículos da parashá ${parashaName(parasha, l)}.`,
              en: `The passages of this chapter explain verses of parashat ${parashaName(parasha, l)}.`,
              he: `הקטעים בפרשה הזאת מפרשים פסוקים מפרשת ${parashaName(parasha, l)}.`,
            }[l],
            evidence: quoteFor(p, l),
            context: null,
          })),
        });
      }
    }

    // 4. Em qual parashá do Tanchuma está o trecho (do meio da seção).
    if (w.title === 'Midrash Tanchuma') {
      for (const segs of groups.values()) {
        const node = segs[0]!.node;
        const parasha = node ? parashaOfNode(node) : undefined;
        if (!parasha || segs[0]!.indices[0]! % 2 === 1) continue;
        const seg = segs[Math.floor(segs.length / 2)]!;
        const p = pairOf(corpus, w.title, seg.ref);
        const opening = p ? index.unique(p.he.text, 5, 10) : null;
        if (!p || !opening) continue;
        const opts = [parasha, ...distractors(parasha, PARASHOT.filter((x) => x.book === parasha.book), rngFor(`tparasha|${seg.ref}`), (o) => Math.abs(o.number - parasha.number))];
        if (opts.length < 4) continue;
        out.push({
          id: `midrash-tanchuma-parasha:${refKey(seg.ref)}`,
          ...base,
          track: 'midrash',
          parashot: [parasha.id],
          difficulty: 'expert',
          kind: 'midrash-tanchuma-parasha',
          sourceRef: p.ref,
          i18n: perLocale((l) => ({
            text: { pt: 'Este trecho do Midrash Tanchuma está na seção de qual parashá?', en: 'This passage of Midrash Tanchuma is in the section of which parashah?', he: 'הקטע הזה ממדרש תנחומא נמצא בפרשת…?' }[l],
            options: opts.map((o) => parashaName(o, l)),
            explanation: { pt: `É ${label(seg.ref, l, w)}, na parashá ${parashaName(parasha, l)}.`, en: `It is ${label(seg.ref, l, w)}, in parashat ${parashaName(parasha, l)}.`, he: `זהו ${wname(w, l)}, פרשת ${parashaName(parasha, l)}.` }[l],
            evidence: quoteFor(p, l, 10, 16, opening),
            context: { ...quoteFor(p, l, 10, 16, opening), label: { pt: 'O midrash', en: 'The midrash', he: 'המדרש' }[l] },
          })),
        });
      }
    }
  }
  return out;
}
