/**
 * books.json — índice oficial do Sefaria-Export (gerado mensalmente pelo Sefaria).
 * Cada entrada é UMA versão de UM livro; agrupamos por título.
 *
 * Observação: a pasta "English" do export guarda todas as traduções não hebraicas;
 * o idioma real vem do sufixo do versionTitle ("… [pt]") ou do campo actualLanguage.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { categoryForSefariaPath, type CategoryId } from '@trivia/shared';

const BookEntrySchema = z.object({
  title: z.string(),
  language: z.string(),
  versionTitle: z.string(),
  categories: z.array(z.string()),
  json_url: z.string().optional(),
});
export type BookEntry = z.infer<typeof BookEntrySchema>;

export const BooksIndexSchema = z.object({
  generated_at: z.string().optional(),
  base_url: z.string().optional(),
  books: z.array(BookEntrySchema),
});
export type BooksIndex = z.infer<typeof BooksIndexSchema>;

export interface BookVersionRef {
  versionTitle: string;
  /** Pasta no export: "Hebrew" ou "English". */
  folderLanguage: string;
  /** Idioma real (he, en, pt, fr…). */
  language: string;
  jsonUrl?: string;
  /** Caminho relativo à raiz do export, ex.: "json/Tanakh/Torah/Genesis/Hebrew/Tanach with Ta'amei Hamikra.json". */
  relativePath: string;
}

export interface BookGroup {
  title: string;
  categories: string[];
  category: CategoryId;
  versions: BookVersionRef[];
}

export function languageOfVersion(folderLanguage: string, versionTitle: string): string {
  const tag = /\[([A-Za-z]{2,3})\]\s*$/.exec(versionTitle);
  if (tag) return tag[1]!.toLowerCase();
  return folderLanguage === 'Hebrew' ? 'he' : 'en';
}

/** Mesma limpeza que o exportador do Sefaria aplica ao nome do arquivo. */
export function sanitizeFileName(name: string): string {
  return name.replace(/[/:()<>"|?*\r\n\t\\]/g, '');
}

export function relativePathFor(entry: BookEntry): string {
  if (entry.json_url) {
    const pathname = decodeURIComponent(new URL(entry.json_url).pathname);
    const marker = '/json/';
    const at = pathname.indexOf(marker);
    if (at >= 0) return pathname.slice(at + 1);
  }
  return path.posix.join(
    'json',
    ...entry.categories,
    entry.title,
    entry.language,
    `${sanitizeFileName(entry.versionTitle)}.json`,
  );
}

export function schemaRelativePath(title: string): string {
  return `schemas/${title.replace(/ /g, '_')}.json`;
}

export async function loadBooksIndex(exportPath: string): Promise<BooksIndex> {
  const file = path.join(exportPath, 'books.json');
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    throw new Error(`books.json não encontrado em ${exportPath}. Rode antes: pnpm pipeline download --title <livro>`);
  }
  return BooksIndexSchema.parse(JSON.parse(raw));
}

export interface BookFilter {
  titles?: readonly string[];
  categories?: readonly CategoryId[];
  languages: readonly string[];
  /** Aceita livros fora das categorias da roleta (comentários, Zohar…), usados pelo Golem World. */
  anyCategory?: boolean;
}

/** Agrupa o índice por livro, mantendo só livros do jogo e versões nos idiomas pedidos. */
export function groupBooks(index: BooksIndex, filter: BookFilter): BookGroup[] {
  const byTitle = new Map<string, BookGroup>();
  const titleSet = filter.titles?.length ? new Set(filter.titles.map((t) => t.toLowerCase())) : null;
  for (const entry of index.books) {
    if (entry.versionTitle === 'merged') continue; // sem licença própria: usamos versões individuais
    if (titleSet && !titleSet.has(entry.title.toLowerCase())) continue;
    const category = categoryForSefariaPath(entry.categories, entry.title) ?? (filter.anyCategory ? 'torah' : null);
    if (!category) continue;
    if (filter.categories?.length && !filter.categories.includes(category)) continue;
    const language = languageOfVersion(entry.language, entry.versionTitle);
    if (!filter.languages.includes(language)) continue;

    let group = byTitle.get(entry.title);
    if (!group) {
      group = { title: entry.title, categories: entry.categories, category, versions: [] };
      byTitle.set(entry.title, group);
    }
    group.versions.push({
      versionTitle: entry.versionTitle,
      folderLanguage: entry.language,
      language,
      ...(entry.json_url ? { jsonUrl: entry.json_url } : {}),
      relativePath: relativePathFor(entry),
    });
  }
  return [...byTitle.values()];
}
