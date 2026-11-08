/**
 * Download seletivo do Sefaria-Export (bucket público no Google Cloud Storage).
 *
 * O export completo tem ~26 GB; aqui baixamos só os livros pedidos, nos idiomas
 * configurados, espelhando a estrutura do bucket dentro de SEFARIA_EXPORT_PATH:
 *
 *   <SEFARIA_EXPORT_PATH>/books.json
 *   <SEFARIA_EXPORT_PATH>/json/<categorias>/<título>/<Hebrew|English>/<versão>.json
 *   <SEFARIA_EXPORT_PATH>/schemas/<Título>.json
 *
 * Conforme orientação do próprio Sefaria, coleta em massa usa o export, não a API.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PipelineConfig } from '../config.js';
import { log, mapWithConcurrency, safeJoin, withRetry } from '../util.js';
import { BooksIndexSchema, groupBooks, loadBooksIndex, schemaRelativePath, type BookFilter } from './books-index.js';

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Teto por arquivo baixado (o maior texto do Sefaria tem poucas dezenas de MB). */
const MAX_FILE_BYTES = 300 * 1024 * 1024;

/** Só baixa por https e dos mesmos servidores configurados (bucket do Sefaria e GitHub). */
export function assertAllowedUrl(url: string, allowedHosts: string[]): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL inválida: ${url}`);
  }
  if (parsed.protocol !== 'https:' || !allowedHosts.includes(parsed.host)) {
    throw new Error(`URL fora das origens permitidas (${allowedHosts.join(', ')}): ${url}`);
  }
}

/** Lê o corpo em pedaços e para assim que passar do teto (sem depender do Content-Length). */
export async function readCapped(res: Response, maxBytes: number, url: string): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`Arquivo grande demais (mais de ${maxBytes} bytes): ${url}`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function fetchToFile(url: string, file: string): Promise<number> {
  const res = await fetch(url, { redirect: 'error' });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_FILE_BYTES) throw new Error(`Arquivo grande demais (${declared} bytes): ${url}`);
  const body = await readCapped(res, MAX_FILE_BYTES, url);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
  return body.length;
}

/** Baixa um arquivo qualquer do bucket (ex.: links/links0.csv) para o export local. */
export async function downloadExportFile(config: PipelineConfig, relativePath: string, opts: { force?: boolean } = {}): Promise<{ file: string; bytes: number }> {
  const file = safeJoin(config.sefaria.exportPath, relativePath);
  if (!opts.force && (await exists(file))) return { file, bytes: 0 };
  const url = bucketUrl(config.sefaria.exportBaseUrl, relativePath);
  assertAllowedUrl(url, [new URL(config.sefaria.exportBaseUrl).host]);
  const bytes = await withRetry(() => fetchToFile(url, file), { label: path.basename(file) });
  return { file, bytes };
}

function bucketUrl(baseUrl: string, relativePath: string): string {
  return `${baseUrl}/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
}

/** Baixa (ou atualiza) o books.json a partir do repositório Sefaria-Export no GitHub. */
export async function downloadBooksIndex(config: PipelineConfig): Promise<void> {
  const file = path.join(config.sefaria.exportPath, 'books.json');
  log.info(`Baixando índice books.json…`);
  const res = await withRetry(() => fetch(config.sefaria.booksIndexUrl), { label: 'books.json' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${config.sefaria.booksIndexUrl}`);
  const text = await res.text();
  BooksIndexSchema.parse(JSON.parse(text)); // valida antes de gravar
  await mkdir(config.sefaria.exportPath, { recursive: true });
  await writeFile(file, text);
}

export interface DownloadOptions extends Omit<BookFilter, 'languages'> {
  /** Livros da jornada que podem não existir no índice (ex.: um comentário sobre Levítico): sem erro. */
  allowMissing?: boolean;
  force?: boolean;
  refreshIndex?: boolean;
}

export interface DownloadSummary {
  books: number;
  files: number;
  skipped: number;
  failed: { url: string; error: string }[];
  bytes: number;
}

export async function downloadBooks(config: PipelineConfig, options: DownloadOptions): Promise<DownloadSummary> {
  const exportPath = config.sefaria.exportPath;
  if (options.refreshIndex || !(await exists(path.join(exportPath, 'books.json')))) {
    await downloadBooksIndex(config);
  }
  const index = await loadBooksIndex(exportPath);
  const groups = groupBooks(index, { ...options, languages: config.sefaria.languages });
  if (groups.length === 0 && !options.allowMissing) {
    throw new Error('Nenhum livro do jogo corresponde aos filtros. Confira o título exatamente como no Sefaria (ex.: "Genesis").');
  }

  const allowedHosts = [new URL(config.sefaria.exportBaseUrl).host, new URL(config.sefaria.booksIndexUrl).host];
  const jobs: { url: string; file: string }[] = [];
  for (const group of groups) {
    const schemaPath = schemaRelativePath(group.title);
    jobs.push({ url: bucketUrl(config.sefaria.exportBaseUrl, schemaPath), file: safeJoin(exportPath, schemaPath) });
    for (const v of group.versions) {
      jobs.push({
        url: v.jsonUrl ?? bucketUrl(config.sefaria.exportBaseUrl, v.relativePath),
        file: safeJoin(exportPath, v.relativePath),
      });
    }
  }
  for (const job of jobs) assertAllowedUrl(job.url, allowedHosts);

  const summary: DownloadSummary = { books: groups.length, files: 0, skipped: 0, failed: [], bytes: 0 };
  log.info(`${groups.length} livro(s), ${jobs.length} arquivo(s) para verificar.`);
  await mapWithConcurrency(jobs, 4, async (job) => {
    if (!options.force && (await exists(job.file))) {
      summary.skipped++;
      return;
    }
    try {
      summary.bytes += await withRetry(() => fetchToFile(job.url, job.file), { label: path.basename(job.file) });
      summary.files++;
    } catch (error) {
      summary.failed.push({ url: job.url, error: error instanceof Error ? error.message : String(error) });
    }
  });
  return summary;
}
