/**
 * Escolha da melhor versão de cada idioma para um livro.
 *
 * Critérios, nesta ordem:
 *   1. licença aceita (ALLOWED_LICENSES) ou versão autorizada explicitamente;
 *   2. licença menos restritiva (Domínio Público > CC0 > CC-BY > CC-BY-SA);
 *   3. versão marcada como primária pelo Sefaria;
 *   4. prioridade do Sefaria;
 *   5. cobertura (quantidade de segmentos com texto).
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { safeJoin } from '../util.js';
import type { SourceLanguage } from '@trivia/shared';
import type { BookGroup } from './books-index.js';
import { flattenSegments, readVersionFile, type RawSegment, type VersionDoc } from './export-reader.js';
import { checkLicense, licenseRank, normalizeLicense, type LicensePolicy } from './licenses.js';

export interface LoadedVersion {
  doc: VersionDoc;
  file: string;
  language: string;
  license: string;
  segments: RawSegment[];
}

export interface ChosenVersion extends LoadedVersion {
  authorized: boolean;
}

export interface VersionChoice {
  chosen: Partial<Record<SourceLanguage, ChosenVersion>>;
  rejected: { versionTitle: string; language: string; reason: string }[];
}

export function versionLanguage(doc: VersionDoc): string {
  return (doc.actualLanguage ?? doc.language).toLowerCase();
}

/** Lê todas as versões baixadas de um livro (pastas Hebrew/ e English/), exceto merged. */
export async function loadLocalVersions(exportPath: string, group: BookGroup): Promise<LoadedVersion[]> {
  const out: LoadedVersion[] = [];
  for (const folder of ['Hebrew', 'English']) {
    const dir = safeJoin(exportPath, 'json', ...group.categories, group.title, folder);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of files.sort()) {
      if (!name.endsWith('.json') || name === 'merged.json') continue;
      const file = safeJoin(dir, name);
      const doc = await readVersionFile(file);
      out.push({
        doc,
        file,
        language: versionLanguage(doc),
        license: normalizeLicense(doc.license),
        segments: flattenSegments(doc.text),
      });
    }
  }
  return out;
}

export function chooseVersions(
  versions: readonly LoadedVersion[],
  languages: readonly SourceLanguage[],
  policy: LicensePolicy,
): VersionChoice {
  const chosen: VersionChoice['chosen'] = {};
  const rejected: VersionChoice['rejected'] = [];

  for (const language of languages) {
    const candidates: ChosenVersion[] = [];
    for (const v of versions.filter((x) => x.language === language)) {
      const decision = checkLicense(v.license, v.doc.versionTitle, policy);
      if (!decision.allowed) {
        rejected.push({ versionTitle: v.doc.versionTitle, language, reason: decision.reason });
        continue;
      }
      if (v.segments.length === 0) {
        rejected.push({ versionTitle: v.doc.versionTitle, language, reason: 'sem texto' });
        continue;
      }
      candidates.push({ ...v, authorized: decision.reason === 'authorized' });
    }
    candidates.sort(
      (a, b) =>
        licenseRank(a.license) - licenseRank(b.license) ||
        Number(b.doc.isPrimary ?? false) - Number(a.doc.isPrimary ?? false) ||
        (b.doc.priority ?? 0) - (a.doc.priority ?? 0) ||
        b.segments.length - a.segments.length,
    );
    if (candidates[0]) chosen[language] = candidates[0];
  }
  return { chosen, rejected };
}
