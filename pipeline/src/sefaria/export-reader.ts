/**
 * Leitura dos arquivos do Sefaria-Export (uma versão de um livro por arquivo)
 * e dos schemas de índice (estrutura do livro: capítulo/versículo, daf/linha…).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { safeJoin } from '../util.js';
import { z } from 'zod';
import { schemaRelativePath } from './books-index.js';

export const VersionDocSchema = z.object({
  title: z.string(),
  versionTitle: z.string(),
  language: z.string(),
  actualLanguage: z.string().optional(),
  // Alguns arquivos do export trazem estes campos como null (ex.: Rashi on Genesis).
  license: z.string().nullish(),
  versionSource: z.string().nullish(),
  isPrimary: z.boolean().nullish(),
  priority: z.number().nullish(),
  categories: z.array(z.string()).optional(),
  sectionNames: z.array(z.string()).optional(),
  heTitle: z.string().nullish(),
  text: z.unknown(),
  schema: z.unknown().optional(),
});
export type VersionDoc = z.infer<typeof VersionDocSchema>;

export async function readVersionFile(file: string): Promise<VersionDoc> {
  const raw = JSON.parse(await readFile(file, 'utf8')) as unknown;
  return VersionDocSchema.parse(raw);
}

const IndexFileSchema = z.object({
  title: z.string(),
  heTitle: z.string().optional(),
  categories: z.array(z.string()),
  schema: z.object({
    nodeType: z.string(),
    depth: z.number().optional(),
    addressTypes: z.array(z.string()).optional(),
    sectionNames: z.array(z.string()).optional(),
    nodes: z.array(z.unknown()).optional(),
  }),
});

export type BookStructure =
  | {
      simple: true;
      title: string;
      heTitle?: string;
      depth: number;
      addressTypes: string[];
      sectionNames: string[];
    }
  | { simple: false; title: string; reason: string };

/**
 * Lê `schemas/<Título>.json`. Livros com schema complexo (vários nós, ex.: Midrash
 * Tanchuma) ainda não são suportados e voltam com `simple: false`.
 */
export async function loadBookStructure(exportPath: string, title: string): Promise<BookStructure> {
  const file = safeJoin(exportPath, schemaRelativePath(title));
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return { simple: false, title, reason: `schema não encontrado (${schemaRelativePath(title)})` };
  }
  const parsed = IndexFileSchema.safeParse(raw);
  if (!parsed.success) return { simple: false, title, reason: 'schema em formato inesperado' };
  const s = parsed.data.schema;
  if (s.nodeType !== 'JaggedArrayNode' || !s.addressTypes || !s.depth) {
    return { simple: false, title, reason: `estrutura complexa (${s.nodeType}) ainda não suportada` };
  }
  return {
    simple: true,
    title: parsed.data.title,
    ...(parsed.data.heTitle ? { heTitle: parsed.data.heTitle } : {}),
    depth: s.depth,
    addressTypes: s.addressTypes,
    sectionNames: s.sectionNames ?? [],
  };
}

export interface RawSegment {
  /** Índices no array aninhado (base 0). */
  indices: number[];
  text: string;
}

/**
 * Achata o JaggedArray em segmentos não vazios, na ordem do texto. Livros com vários
 * nós (texto como objeto: introdução + corpo) também são lidos, nó a nó; a ingestão
 * que precisa das referências desses nós usa o schema para nomeá-los.
 */
export function flattenSegments(text: unknown): RawSegment[] {
  const out: RawSegment[] = [];
  const walk = (node: unknown, indices: number[]) => {
    if (typeof node === 'string') {
      if (node.trim()) out.push({ indices, text: node });
      return;
    }
    if (Array.isArray(node)) node.forEach((child, i) => walk(child, [...indices, i]));
    else if (node && typeof node === 'object' && indices.length === 0) {
      Object.values(node as Record<string, unknown>).forEach((child, i) => walk(child, [i]));
    }
  };
  walk(text, []);
  return out;
}
