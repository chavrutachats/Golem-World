/**
 * Ingestão: livros baixados do Sefaria-Export → passagens (SourcePassage) no banco.
 *
 * Para cada livro: lê a estrutura (schema), escolhe a melhor versão permitida em cada
 * idioma, alinha os idiomas pela referência de cada segmento, recorta em passagens e
 * grava. Rodar de novo é seguro: passagens sem mudança ficam como estão; passagens
 * cujo texto mudou no Sefaria voltam para "pending".
 */
import type { Prisma, PrismaClient } from '@trivia/db';
import { stripSefariaMarkup, type CategoryId, type SourceLanguage } from '@trivia/shared';
import type { PipelineConfig } from '../config.js';
import { groupBooks, loadBooksIndex, type BookGroup } from '../sefaria/books-index.js';
import { loadBookStructure } from '../sefaria/export-reader.js';
import { formatAddress, rangeRef, segmentRef } from '../sefaria/refs.js';
import { chooseVersions, loadLocalVersions, type ChosenVersion } from '../sefaria/versions.js';
import { log, sha256 } from '../util.js';
import { CHUNK_POLICIES, chunkSegments, segmentWords, type AlignedSegment } from './chunker.js';

export interface IngestOptions {
  titles?: string[];
  categories?: CategoryId[];
  /** Só calcula e mostra o resultado, sem gravar no banco. */
  dryRun?: boolean;
}

export interface IngestBookResult {
  title: string;
  category: CategoryId;
  status: 'ingested' | 'skipped';
  reason?: string;
  versions: Partial<Record<SourceLanguage, { versionTitle: string; license: string; authorized: boolean }>>;
  rejectedVersions: { versionTitle: string; language: string; reason: string }[];
  passages: number;
  created: number;
  updated: number;
  unchanged: number;
}

export interface PassageDraft {
  ref: string;
  category: CategoryId;
  bookTitle: string;
  sefariaPath: string[];
  sequence: number;
  section: string;
  heText: string | null;
  heVersionTitle: string | null;
  heLicense: string | null;
  enText: string | null;
  enVersionTitle: string | null;
  enLicense: string | null;
  ptText: string | null;
  ptVersionTitle: string | null;
  ptLicense: string | null;
  segments: { ref: string; he?: string; en?: string; pt?: string }[];
  contentHash: string;
  wordCount: number;
}

const LANGS: readonly SourceLanguage[] = ['he', 'en', 'pt'];

/** Limpa a marcação do Sefaria para o texto que vai ao LLM e ao banco (mantém nikud). */
export function cleanSegmentText(text: string): string {
  return stripSefariaMarkup(text).replace(/\s+/g, ' ').trim();
}

function compareIndices(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

/** Junta os idiomas escolhidos pela posição de cada segmento no texto (= mesma referência no Sefaria). */
export function alignSegments(
  title: string,
  addressTypes: readonly string[],
  chosen: Partial<Record<SourceLanguage, ChosenVersion>>,
): AlignedSegment[] {
  const byKey = new Map<string, AlignedSegment>();
  for (const lang of LANGS) {
    const version = chosen[lang];
    if (!version) continue;
    for (const raw of version.segments) {
      const text = cleanSegmentText(raw.text);
      if (!text) continue;
      const key = raw.indices.join('.');
      let seg = byKey.get(key);
      if (!seg) {
        seg = { indices: raw.indices, ref: segmentRef(title, addressTypes, raw.indices) };
        byKey.set(key, seg);
      }
      seg[lang] = text;
    }
  }
  return [...byKey.values()].sort((a, b) => compareIndices(a.indices, b.indices));
}

export function buildPassageDrafts(
  group: BookGroup,
  addressTypes: readonly string[],
  chosen: Partial<Record<SourceLanguage, ChosenVersion>>,
): PassageDraft[] {
  const aligned = alignSegments(group.title, addressTypes, chosen);
  const chunks = chunkSegments(aligned, CHUNK_POLICIES[group.category]);
  return chunks.map((chunk, sequence) => {
    const first = chunk[0]!;
    const last = chunk[chunk.length - 1]!;
    const ref = rangeRef(group.title, addressTypes, first.indices, last.indices);
    const join = (lang: SourceLanguage) => {
      const parts = chunk.map((s) => s[lang]).filter((t): t is string => !!t);
      return parts.length ? parts.join(' ') : null;
    };
    const versionField = (lang: SourceLanguage) => (join(lang) ? chosen[lang] : undefined);
    const segments = chunk.map((s) => ({
      ref: s.ref,
      ...(s.he ? { he: s.he } : {}),
      ...(s.en ? { en: s.en } : {}),
      ...(s.pt ? { pt: s.pt } : {}),
    }));
    const draft: Omit<PassageDraft, 'contentHash'> = {
      ref,
      category: group.category,
      bookTitle: group.title,
      sefariaPath: group.categories,
      sequence,
      section: formatAddress(addressTypes[0], first.indices[0] ?? 0),
      heText: join('he'),
      heVersionTitle: versionField('he')?.doc.versionTitle ?? null,
      heLicense: versionField('he')?.license ?? null,
      enText: join('en'),
      enVersionTitle: versionField('en')?.doc.versionTitle ?? null,
      enLicense: versionField('en')?.license ?? null,
      ptText: join('pt'),
      ptVersionTitle: versionField('pt')?.doc.versionTitle ?? null,
      ptLicense: versionField('pt')?.license ?? null,
      segments,
      wordCount: chunk.reduce((n, s) => n + segmentWords(s), 0),
    };
    const contentHash = sha256(
      JSON.stringify({
        ref,
        segments,
        versions: [draft.heVersionTitle, draft.enVersionTitle, draft.ptVersionTitle],
      }),
    );
    return { ...draft, contentHash };
  });
}

async function persistDrafts(prisma: PrismaClient, title: string, drafts: PassageDraft[]) {
  const existing = await prisma.sourcePassage.findMany({
    where: { bookTitle: title },
    select: { id: true, ref: true, contentHash: true, sequence: true, status: true },
  });
  const byRef = new Map(existing.map((p) => [p.ref, p]));
  const toCreate: Prisma.SourcePassageCreateManyInput[] = [];
  let updated = 0;
  let unchanged = 0;

  for (const d of drafts) {
    const data = { ...d, segments: d.segments as Prisma.InputJsonValue };
    const current = byRef.get(d.ref);
    if (!current) {
      toCreate.push(data);
    } else if (current.contentHash !== d.contentHash) {
      await prisma.sourcePassage.update({
        where: { id: current.id },
        data: { ...data, status: current.status === 'in_batch' ? 'in_batch' : 'pending', lastError: null },
      });
      updated++;
    } else {
      if (current.sequence !== d.sequence) {
        await prisma.sourcePassage.update({ where: { id: current.id }, data: { sequence: d.sequence } });
      }
      unchanged++;
    }
  }
  if (toCreate.length) await prisma.sourcePassage.createMany({ data: toCreate });
  return { created: toCreate.length, updated, unchanged };
}

export async function ingest(
  config: PipelineConfig,
  prisma: PrismaClient | null,
  options: IngestOptions = {},
): Promise<IngestBookResult[]> {
  const index = await loadBooksIndex(config.sefaria.exportPath);
  const groups = groupBooks(index, { ...options, languages: config.sefaria.languages });
  const policy = {
    allowedLicenses: config.sefaria.allowedLicenses,
    authorizedVersions: config.sefaria.authorizedVersions,
  };
  const results: IngestBookResult[] = [];

  for (const group of groups) {
    const base: IngestBookResult = {
      title: group.title,
      category: group.category,
      status: 'skipped',
      versions: {},
      rejectedVersions: [],
      passages: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
    };
    const structure = await loadBookStructure(config.sefaria.exportPath, group.title);
    if (!structure.simple) {
      results.push({ ...base, reason: structure.reason });
      continue;
    }
    const versions = await loadLocalVersions(config.sefaria.exportPath, group);
    if (versions.length === 0) {
      results.push({ ...base, reason: 'nenhuma versão baixada (rode o comando download)' });
      continue;
    }
    const { chosen, rejected } = chooseVersions(versions, config.sefaria.languages, policy);
    const chosenInfo: IngestBookResult['versions'] = {};
    for (const [lang, v] of Object.entries(chosen) as [SourceLanguage, ChosenVersion][]) {
      chosenInfo[lang] = { versionTitle: v.doc.versionTitle, license: v.license, authorized: v.authorized };
    }
    if (Object.keys(chosen).length === 0) {
      results.push({ ...base, rejectedVersions: rejected, reason: 'nenhuma versão com licença aceita' });
      continue;
    }

    const drafts = buildPassageDrafts(group, structure.addressTypes, chosen);
    const counts = prisma && !options.dryRun ? await persistDrafts(prisma, group.title, drafts) : { created: 0, updated: 0, unchanged: 0 };
    results.push({
      ...base,
      status: 'ingested',
      versions: chosenInfo,
      rejectedVersions: rejected,
      passages: drafts.length,
      ...counts,
    });
    log.info(
      `${group.title}: ${drafts.length} passagens (${counts.created} novas, ${counts.updated} atualizadas) — ` +
        Object.entries(chosenInfo)
          .map(([l, v]) => `${l}: ${v!.versionTitle} [${v!.license}${v!.authorized ? ', autorizada' : ''}]`)
          .join('; '),
    );
  }
  return results;
}
