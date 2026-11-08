/**
 * Download das fontes das trilhas do Golem World a partir do Sefaria-Export:
 *  1. Torá, comentaristas, Midrash Rabá, Zohar e Sefer HaChinuch;
 *  2. as conexões do Sefaria (links0.csv … links12.csv, ~500 MB), filtradas na hora
 *     para links/torah-links.csv (alguns MB) — os arquivos brutos são apagados;
 *  3. os tratados da Mishná e do Talmud que essas conexões ligam à Torá.
 */
import { rm } from 'node:fs/promises';
import { COMMENTATORS, FIXED_TRACK_SOURCES, TORAH_BOOKS } from '@trivia/shared';
import type { PipelineConfig } from '../config.js';
import { downloadBooks, downloadExportFile, type DownloadSummary } from '../sefaria/download.js';
import { log, safeJoin } from '../util.js';
import { filterLinkFiles, LinkIndex, readTorahLinks, TORAH_LINKS_FILE } from './links.js';

export const LINK_FILE_COUNT = 13;

export function journeyFixedTitles(): string[] {
  return [
    ...TORAH_BOOKS,
    ...COMMENTATORS.flatMap((c) => TORAH_BOOKS.map((b) => c.titleFor(b))),
    ...FIXED_TRACK_SOURCES.map((s) => s.title),
  ];
}

export async function downloadJourney(config: PipelineConfig, opts: { force?: boolean; keepRawLinks?: boolean } = {}): Promise<DownloadSummary[]> {
  const summaries: DownloadSummary[] = [];
  log.info('1/3 Textos das trilhas (Torá, comentaristas, Midrash, Zohar, Sefer HaChinuch)…');
  summaries.push(await downloadBooks(config, { titles: journeyFixedTitles(), anyCategory: true, allowMissing: true, force: opts.force ?? false }));

  const linksFile = safeJoin(config.sefaria.exportPath, TORAH_LINKS_FILE);
  log.info('2/3 Conexões do Sefaria (links)…');
  const raw: string[] = [];
  for (let i = 0; i < LINK_FILE_COUNT; i++) {
    const { file, bytes } = await downloadExportFile(config, `links/links${i}.csv`, { force: opts.force ?? false });
    raw.push(file);
    log.info(`  links${i}.csv ${bytes ? `(${(bytes / 1e6).toFixed(0)} MB)` : '(já existia)'}`);
  }
  const kept = await filterLinkFiles(raw, linksFile);
  log.info(`  ${kept} conexões da Torá guardadas em ${TORAH_LINKS_FILE}.`);
  if (!opts.keepRawLinks) for (const f of raw) await rm(f, { force: true });

  log.info('3/3 Mishná e Talmud ligados à Torá…');
  const links = new LinkIndex(await readTorahLinks(linksFile));
  const titles = [...links.baseTitles('Mishnah'), ...links.baseTitles('Talmud')];
  summaries.push(await downloadBooks(config, { titles, anyCategory: true, allowMissing: true, force: opts.force ?? false }));
  return summaries;
}
