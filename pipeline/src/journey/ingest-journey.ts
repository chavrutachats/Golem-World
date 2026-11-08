/**
 * Ingestão das trilhas do Golem World: textos do Sefaria-Export → StudyText.
 *
 * Cada segmento (um versículo, um comentário, uma mishná, um parágrafo do Zohar…) é
 * gravado com os versículos da Torá a que se liga (`anchors`) e as parashiot deles:
 *
 *  - Torá: o próprio versículo;
 *  - comentaristas ("Rashi on Genesis 1:1:2"): o versículo comentado, pela estrutura;
 *  - Midrash, Mishná, Talmud, Zohar e Sefer HaChinuch: as conexões do Sefaria
 *    (links/torah-links.csv). Segmentos sem conexão com a Torá ficam de fora.
 *
 * As mesmas regras de licença da ingestão da roleta valem aqui (ALLOWED_LICENSES e
 * SEFARIA_AUTHORIZED_VERSIONS). Rodar de novo é seguro: só o que mudou é gravado.
 */
import { readdir, readFile } from 'node:fs/promises';
import type { Prisma, PrismaClient } from '@trivia/db';
import {
  COMMENTATORS,
  FIXED_TRACK_SOURCES,
  TORAH_BOOKS,
  parashotForRef,
  stripHebrewMarks,
  type JourneyTrack,
  type SourceLanguage,
} from '@trivia/shared';
import type { PipelineConfig } from '../config.js';
import { alignSegments, cleanSegmentText } from '../ingest/ingest.js';
import type { AlignedSegment } from '../ingest/chunker.js';
import type { BookGroup } from '../sefaria/books-index.js';
import { flattenSegments, loadBookStructure, type RawSegment } from '../sefaria/export-reader.js';
import { formatAddress } from '../sefaria/refs.js';
import { chooseVersions, loadLocalVersions, type ChosenVersion, type LoadedVersion } from '../sefaria/versions.js';
import { log, safeJoin, sha256 } from '../util.js';
import { LinkIndex, readTorahLinks, TORAH_LINKS_FILE } from './links.js';

export type AnchorMode = 'self' | 'structure' | 'links';

export interface JourneyBook {
  title: string;
  path: readonly string[];
  track: JourneyTrack;
  author: string | null;
  anchorMode: AnchorMode;
  /** Livro da Torá comentado (só comentaristas). */
  baseBook?: string;
}

export interface StudyDraft {
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
  wordCount: number;
  contentHash: string;
}

export interface JourneyIngestResult {
  title: string;
  track: JourneyTrack;
  status: 'ingested' | 'skipped';
  reason?: string;
  versions: Partial<Record<SourceLanguage, string>>;
  segments: number;
  created: number;
  updated: number;
  removed: number;
}

const LANGS: readonly SourceLanguage[] = ['he', 'en', 'pt'];

/** Pastas de livros da Mishná/Talmud no export ("json/Mishnah/Seder Zeraim/Mishnah Berakhot"). */
async function findBookDirs(exportPath: string, root: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  let seders: string[] = [];
  try {
    seders = await readdir(safeJoin(exportPath, 'json', ...root));
  } catch {
    return out;
  }
  for (const seder of seders.filter((s) => s.startsWith('Seder '))) {
    try {
      for (const title of await readdir(safeJoin(exportPath, 'json', ...root, seder))) out.set(title, [...root, seder]);
    } catch {
      /* não é pasta */
    }
  }
  return out;
}

/** Lista os livros das trilhas que existem no export local. */
export async function journeyBooks(exportPath: string, links: LinkIndex | null): Promise<JourneyBook[]> {
  const books: JourneyBook[] = [];
  for (const b of TORAH_BOOKS) books.push({ title: b, path: ['Tanakh', 'Torah'], track: 'torah', author: null, anchorMode: 'self' });
  for (const c of COMMENTATORS) {
    for (const b of TORAH_BOOKS) {
      books.push({ title: c.titleFor(b), path: c.path, track: 'commentators', author: c.namePt, anchorMode: 'structure', baseBook: b });
    }
  }
  if (!links) return books;
  for (const s of FIXED_TRACK_SOURCES) books.push({ title: s.title, path: s.path, track: s.track, author: null, anchorMode: 'links' });
  const mishnahDirs = await findBookDirs(exportPath, ['Mishnah']);
  for (const title of links.baseTitles('Mishnah')) {
    const dir = mishnahDirs.get(title);
    if (dir) books.push({ title, path: dir, track: 'mishnah', author: null, anchorMode: 'links' });
  }
  const talmudDirs = await findBookDirs(exportPath, ['Talmud', 'Bavli']);
  for (const title of links.baseTitles('Talmud')) {
    const dir = talmudDirs.get(title);
    if (dir) books.push({ title, path: dir, track: 'talmud', author: null, anchorMode: 'links' });
  }
  return books;
}

interface ComplexNode {
  /** Nome do nó na referência ("Bereshit" em "Zohar, Bereshit 6:54"); vazio no nó padrão. */
  refName: string;
  /** Chave do nó no JSON do texto. */
  key: string;
  addressTypes: string[];
}

/**
 * Estrutura de livros com vários nós (o Zohar tem um por parashá; o Sefer HaChinuch,
 * a introdução e as mitzvot). Só o primeiro nível de nós é lido.
 */
async function loadComplexNodes(exportPath: string, title: string): Promise<ComplexNode[] | null> {
  try {
    const raw = JSON.parse(await readFile(safeJoin(exportPath, 'schemas', `${title.replace(/ /g, '_')}.json`), 'utf8')) as {
      schema?: { nodes?: { key?: string; default?: boolean; nodeType?: string; addressTypes?: string[]; titles?: { text: string; lang: string; primary?: boolean }[] }[] };
    };
    const nodes = raw.schema?.nodes;
    if (!nodes?.length) return null;
    return nodes
      .filter((n) => n.nodeType === 'JaggedArrayNode' && n.addressTypes?.length)
      .map((n) => {
        const en = n.titles?.find((t) => t.lang === 'en' && t.primary)?.text ?? n.titles?.find((t) => t.lang === 'en')?.text ?? n.key ?? '';
        return { refName: n.default ? '' : en, key: n.default ? 'default' : (n.key ?? en), addressTypes: n.addressTypes! };
      });
  } catch {
    return null;
  }
}

function complexSegments(text: unknown, node: ComplexNode): RawSegment[] {
  if (!text || typeof text !== 'object' || Array.isArray(text)) return [];
  const obj = text as Record<string, unknown>;
  const sub = obj[node.key] ?? obj[node.refName] ?? (node.refName === '' ? obj[''] : undefined);
  return flattenSegments(sub);
}

function nodeRef(title: string, node: ComplexNode, indices: readonly number[]): string {
  const addr = indices.map((idx, depth) => formatAddress(node.addressTypes[depth], idx)).join(':');
  return node.refName ? `${title}, ${node.refName} ${addr}` : `${title} ${addr}`;
}

/** Alinha os idiomas de um livro com vários nós; a referência inclui o nome do nó. */
function alignComplex(title: string, nodes: readonly ComplexNode[], chosen: Partial<Record<SourceLanguage, ChosenVersion>>): AlignedSegment[] {
  const out: AlignedSegment[] = [];
  nodes.forEach((node) => {
    const byKey = new Map<string, AlignedSegment>();
    for (const lang of LANGS) {
      const v = chosen[lang];
      if (!v) continue;
      for (const raw of complexSegments(v.doc.text, node)) {
        const text = cleanSegmentText(raw.text);
        if (!text) continue;
        const key = raw.indices.join('.');
        let seg = byKey.get(key);
        if (!seg) byKey.set(key, (seg = { indices: raw.indices, ref: nodeRef(title, node, raw.indices) }));
        seg[lang] = text;
      }
    }
    out.push(...[...byKey.values()].sort((a, b) => a.indices.join('.').localeCompare(b.indices.join('.'), 'en', { numeric: true })));
  });
  return out;
}

function words(text: string | undefined): number {
  return text ? stripHebrewMarks(text).split(/\s+/).filter(Boolean).length : 0;
}

export function anchorsFor(book: JourneyBook, seg: AlignedSegment, links: LinkIndex | null): string[] {
  if (book.anchorMode === 'self') return [seg.ref];
  if (book.anchorMode === 'structure') {
    // Só o corpo do comentário ("Ramban on Genesis 1:1:2"); a introdução não comenta um versículo.
    if (!/^\d+:\d+/.test(seg.ref.slice(book.title.length + 1))) return [];
    const [c, v] = seg.indices;
    return c === undefined || v === undefined ? [] : [`${book.baseBook} ${c + 1}:${v + 1}`];
  }
  return links ? links.anchorsFor(seg.ref) : [];
}

export function buildStudyDrafts(
  book: JourneyBook,
  segments: readonly AlignedSegment[],
  chosen: Partial<Record<SourceLanguage, ChosenVersion>>,
  links: LinkIndex | null,
): StudyDraft[] {
  const out: StudyDraft[] = [];
  segments.forEach((seg, sequence) => {
    const anchors = anchorsFor(book, seg, links);
    const parashot = [...new Set(anchors.flatMap((a) => parashotForRef(a)))];
    if (parashot.length === 0) return;
    const field = (lang: SourceLanguage) => (seg[lang] ? chosen[lang] : undefined);
    const draft: Omit<StudyDraft, 'contentHash'> = {
      ref: seg.ref,
      track: book.track,
      bookTitle: book.title,
      author: book.author,
      sequence,
      heText: seg.he ?? null,
      heVersionTitle: field('he')?.doc.versionTitle ?? null,
      heLicense: field('he')?.license ?? null,
      enText: seg.en ?? null,
      enVersionTitle: field('en')?.doc.versionTitle ?? null,
      enLicense: field('en')?.license ?? null,
      ptText: seg.pt ?? null,
      ptVersionTitle: field('pt')?.doc.versionTitle ?? null,
      ptLicense: field('pt')?.license ?? null,
      anchors: anchors.sort(),
      parashot: parashot.sort(),
      wordCount: Math.max(words(seg.he), words(seg.en), words(seg.pt)),
    };
    out.push({ ...draft, contentHash: sha256(JSON.stringify(draft)) });
  });
  return out;
}

async function persistStudyDrafts(prisma: PrismaClient, title: string, drafts: StudyDraft[]) {
  const existing = await prisma.studyText.findMany({ where: { bookTitle: title }, select: { id: true, ref: true, contentHash: true } });
  const byRef = new Map(existing.map((r) => [r.ref, r]));
  const toCreate: Prisma.StudyTextCreateManyInput[] = [];
  let updated = 0;
  for (const d of drafts) {
    const current = byRef.get(d.ref);
    byRef.delete(d.ref);
    if (!current) toCreate.push(d);
    else if (current.contentHash !== d.contentHash) {
      await prisma.studyText.update({ where: { id: current.id }, data: d });
      updated++;
    }
  }
  for (let i = 0; i < toCreate.length; i += 1000) await prisma.studyText.createMany({ data: toCreate.slice(i, i + 1000), skipDuplicates: true });
  // Segmentos que sumiram do texto: tira os que nenhuma pergunta usa.
  let removed = 0;
  const gone = [...byRef.values()].map((r) => r.id);
  if (gone.length) {
    const res = await prisma.studyText.deleteMany({ where: { id: { in: gone }, questions: { none: {} } } });
    removed = res.count;
  }
  return { created: toCreate.length, updated, removed };
}

export interface JourneyIngestOptions {
  titles?: string[];
  tracks?: JourneyTrack[];
  dryRun?: boolean;
}

export async function ingestJourney(
  config: PipelineConfig,
  prisma: PrismaClient | null,
  options: JourneyIngestOptions = {},
): Promise<JourneyIngestResult[]> {
  const exportPath = config.sefaria.exportPath;
  let links: LinkIndex | null = null;
  try {
    links = new LinkIndex(await readTorahLinks(safeJoin(exportPath, TORAH_LINKS_FILE)));
    log.info(`Conexões do Sefaria: ${links.titles.size} livros ligados à Torá.`);
  } catch {
    log.warn(`Sem ${TORAH_LINKS_FILE}: Midrash, Mishná, Talmud, Zohar e Sefer HaChinuch ficam de fora (rode download --journey).`);
  }
  const policy = { allowedLicenses: config.sefaria.allowedLicenses, authorizedVersions: config.sefaria.authorizedVersions };
  let books = await journeyBooks(exportPath, links);
  if (options.titles?.length) books = books.filter((b) => options.titles!.some((t) => t.toLowerCase() === b.title.toLowerCase()));
  if (options.tracks?.length) books = books.filter((b) => options.tracks!.includes(b.track));

  const results: JourneyIngestResult[] = [];
  for (const book of books) {
    const base: JourneyIngestResult = { title: book.title, track: book.track, status: 'skipped', versions: {}, segments: 0, created: 0, updated: 0, removed: 0 };
    const group = { title: book.title, categories: [...book.path], category: 'torah', versions: [] } as unknown as BookGroup;
    let versions: LoadedVersion[];
    try {
      versions = await loadLocalVersions(exportPath, group);
    } catch (error) {
      results.push({ ...base, reason: `erro ao ler: ${String(error)}` });
      continue;
    }
    if (versions.length === 0) {
      results.push({ ...base, reason: 'não baixado' });
      continue;
    }
    const { chosen } = chooseVersions(versions, config.sefaria.languages, policy);
    if (Object.keys(chosen).length === 0) {
      results.push({ ...base, reason: 'nenhuma versão com licença aceita' });
      continue;
    }
    let segments: AlignedSegment[];
    const structure = await loadBookStructure(exportPath, book.title);
    if (structure.simple) {
      segments = alignSegments(book.title, structure.addressTypes, chosen);
    } else {
      const nodes = await loadComplexNodes(exportPath, book.title);
      if (!nodes?.length) {
        results.push({ ...base, reason: structure.reason });
        continue;
      }
      segments = alignComplex(book.title, nodes, chosen);
    }
    const drafts = buildStudyDrafts(book, segments, chosen, links);
    const counts = prisma && !options.dryRun ? await persistStudyDrafts(prisma, book.title, drafts) : { created: 0, updated: 0, removed: 0 };
    const versionInfo: JourneyIngestResult['versions'] = {};
    for (const [lang, v] of Object.entries(chosen) as [SourceLanguage, ChosenVersion][]) versionInfo[lang] = `${v.doc.versionTitle} [${v.license}${v.authorized ? ', autorizada' : ''}]`;
    results.push({ ...base, status: 'ingested', versions: versionInfo, segments: drafts.length, ...counts });
    log.info(`${book.title} (${book.track}): ${drafts.length} segmentos ligados à Torá (${counts.created} novos, ${counts.updated} atualizados)`);
  }

  if (prisma && !options.dryRun) await tagTorahQuestions(prisma);
  return results;
}

/** Perguntas do motor de IA sobre a Torá entram na trilha da parashá do trecho de origem. */
export async function tagTorahQuestions(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.question.findMany({
    where: { category: 'torah', origin: 'llm', track: null },
    select: { id: true, sourceRef: true },
  });
  let tagged = 0;
  for (const q of rows) {
    const parashot = parashotForRef(q.sourceRef);
    if (!parashot.length) continue;
    await prisma.question.update({ where: { id: q.id }, data: { track: 'torah', parashot } });
    tagged++;
  }
  if (tagged) log.info(`${tagged} pergunta(s) da Torá ligadas às parashiot.`);
  return tagged;
}
