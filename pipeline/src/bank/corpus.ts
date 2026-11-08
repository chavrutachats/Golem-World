/**
 * Leitura do acervo para o banco: o espelho local do Sefaria-Export (mesmo layout do
 * bucket: json/<categorias>/<título>/<Hebrew|English>/<versão>.json e schemas/), já
 * baixado com `pnpm pipeline download`. Nada aqui usa a rede.
 *
 * De cada livro se escolhe uma versão por idioma, só entre as licenças aceitas
 * (ALLOWED_LICENSES do pipeline), preferindo as versões listadas em PREFERRED.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { stripHebrewMarks } from '@trivia/shared';
import { cleanSegmentText } from '../ingest/ingest.js';
import { flattenSegments } from '../sefaria/export-reader.js';
import { formatAddress } from '../sefaria/refs.js';
import { licenseRank, normalizeLicense } from '../sefaria/licenses.js';

export type CorpusLang = 'he' | 'en';

export interface Segment {
  /** Índices no texto (base 0; nos livros com vários nós, dentro do nó). */
  indices: number[];
  /** Nó do livro (só em livros com vários nós), ex.: "Noach" no Midrash Tanchuma. */
  node?: string;
  /** Referência do Sefaria ("Isaiah 1:1", "Berakhot 2a:1"). */
  ref: string;
  text: string;
}

export interface BookText {
  title: string;
  lang: CorpusLang;
  versionTitle: string;
  license: string;
  segments: Segment[];
  byRef: Map<string, Segment>;
}

/** Versões preferidas (as mais limpas para mostrar), na ordem. */
const PREFERRED: readonly string[] = [
  'Tanach with Nikkud',
  'The Holy Scriptures: A New Translation (JPS 1917)',
  'The Holy Scriptures A New Translation JPS 1917',
  'Torat Emet 357',
  'Torat Emet 363',
  'Wikisource Talmud Bavli',
  'Mishnah Yomit by Dr. Joshua Kulp',
  'Sefaria Edition. Translated by R. Francis Nataf, 2019',
];

const ALLOWED = new Set(['Public Domain', 'CC0', 'CC-BY', 'CC-BY-SA']);

export class Corpus {
  private readonly dirs = new Map<string, string>();
  private readonly schemas = new Map<string, unknown>();
  private readonly texts = new Map<string, BookText | null>();

  constructor(private readonly roots: readonly string[]) {
    for (const root of roots) {
      const json = path.join(root, 'json');
      if (existsSync(json)) this.index(json);
    }
  }

  private index(dir: string): void {
    const names = readdirSync(dir);
    if (names.includes('Hebrew') || names.includes('English')) {
      const title = path.basename(dir);
      if (!this.dirs.has(title)) this.dirs.set(title, dir);
      return;
    }
    for (const n of names) {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) this.index(p);
    }
  }

  titles(): string[] {
    return [...this.dirs.keys()];
  }

  has(title: string): boolean {
    return this.dirs.has(title);
  }

  /** Categorias do livro no Sefaria (o caminho da pasta). */
  categoriesOf(title: string): string[] {
    const dir = this.dirs.get(title);
    if (!dir) return [];
    const rel = this.roots.map((r) => path.relative(path.join(r, 'json'), dir)).find((r) => !r.startsWith('..'));
    return rel ? rel.split(path.sep).slice(0, -1) : [];
  }

  schema<T = SchemaDoc>(title: string): T | null {
    if (!this.schemas.has(title)) {
      const file = this.roots.map((r) => path.join(r, 'schemas', `${title.replace(/ /g, '_')}.json`)).find((f) => existsSync(f));
      this.schemas.set(title, file ? JSON.parse(readFileSync(file, 'utf8')) : null);
    }
    return this.schemas.get(title) as T | null;
  }

  /** O texto de um livro simples (JaggedArray) num idioma, na melhor versão permitida. */
  text(title: string, lang: CorpusLang): BookText | null {
    const key = `${title}|${lang}`;
    if (this.texts.has(key)) return this.texts.get(key)!;
    const result = this.load(title, lang);
    this.texts.set(key, result);
    return result;
  }

  private load(title: string, lang: CorpusLang): BookText | null {
    const dir = this.dirs.get(title);
    if (!dir) return null;
    const folder = path.join(dir, lang === 'he' ? 'Hebrew' : 'English');
    if (!existsSync(folder)) return null;
    const candidates: { file: string; versionTitle: string; license: string; actual: string; text: unknown }[] = [];
    for (const name of readdirSync(folder)) {
      if (!name.endsWith('.json') || name === 'merged.json') continue;
      const doc = JSON.parse(readFileSync(path.join(folder, name), 'utf8')) as { versionTitle?: string; license?: string; actualLanguage?: string; text?: unknown };
      const license = normalizeLicense(doc.license);
      const actual = doc.actualLanguage ?? lang;
      if (!ALLOWED.has(license) || actual !== lang) continue;
      candidates.push({ file: name, versionTitle: doc.versionTitle ?? name.slice(0, -5), license, actual, text: doc.text });
    }
    if (!candidates.length) return null;
    const pref = (v: string) => {
      const i = PREFERRED.indexOf(v);
      return i < 0 ? 99 : i;
    };
    candidates.sort((a, b) => pref(a.versionTitle) - pref(b.versionTitle) || licenseRank(a.license) - licenseRank(b.license) || segCount(b.text) - segCount(a.text));
    const best = candidates[0]!;
    const schema = this.schema(title);
    const segments: Segment[] = [];
    const push = (text: unknown, prefix: string, addressTypes: readonly string[], node?: string) => {
      for (const raw of flattenSegments(text)) {
        const clean = cleanSegmentText(raw.text);
        if (!clean) continue;
        segments.push({ indices: raw.indices, ref: `${prefix} ${raw.indices.map((v, d) => formatAddress(addressTypes[d], v)).join(':')}`, text: clean, ...(node ? { node } : {}) });
      }
    };
    const nodes = (schema?.schema?.nodes ?? []) as SchemaNodeDoc[];
    if (nodes.length && best.text && typeof best.text === 'object' && !Array.isArray(best.text)) {
      // Livro com vários nós (Midrash Tanchuma: um por parashá): "Título, Nó 3:1".
      const obj = best.text as Record<string, unknown>;
      for (const n of nodes) {
        if (n.nodeType !== 'JaggedArrayNode' || !n.addressTypes?.length) continue;
        const en = n.titles?.find((t) => t.lang === 'en' && t.primary)?.text ?? n.key ?? '';
        const isDefault = n.default || n.key === 'default';
        const sub = isDefault ? (obj[''] ?? obj['default']) : (obj[en] ?? obj[n.key ?? '']);
        if (sub === undefined) continue;
        push(sub, isDefault ? title : `${title}, ${en}`, n.addressTypes, isDefault ? undefined : en);
      }
    } else {
      push(best.text, title, schema?.schema?.addressTypes ?? []);
    }
    return { title, lang, versionTitle: best.versionTitle, license: best.license, segments, byRef: new Map(segments.map((s) => [s.ref, s])) };
  }
}

function segCount(text: unknown): number {
  return flattenSegments(text).length;
}

export interface SchemaDoc {
  title: string;
  heTitle?: string;
  categories?: string[];
  order?: number[];
  enShortDesc?: string;
  heShortDesc?: string;
  schema?: { nodeType?: string; addressTypes?: string[]; lengths?: number[]; depth?: number; nodes?: unknown[] };
  alts?: Record<string, { nodes: AltNode[] }>;
}

interface SchemaNodeDoc {
  key?: string;
  default?: boolean;
  nodeType?: string;
  addressTypes?: string[];
  titles?: { text: string; lang: string; primary?: boolean }[];
}

export interface AltNode {
  wholeRef?: string;
  refs?: string[];
  titles: { text: string; lang: string; primary?: boolean }[];
}

export function altTitle(n: AltNode, lang: 'en' | 'he'): string {
  return (n.titles.find((t) => t.lang === lang && t.primary) ?? n.titles.find((t) => t.lang === lang))?.text ?? '';
}

/** As primeiras palavras de um texto (sem pontuação solta nas pontas). */
export function firstWords(text: string, n: number): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, n)
    .join(' ')
    .replace(/[,;:.־׃]+$/u, '');
}

/** Chave de comparação de aberturas (sem nikud, sem pontuação). */
export function openingKey(text: string): string {
  return stripHebrewMarks(text)
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Índice das aberturas de um conjunto de textos, para achar depressa a abertura que só um
 * texto tem (busca binária pelo prefixo nas chaves ordenadas).
 */
export class OpeningIndex {
  private readonly keys: string[];

  constructor(texts: readonly string[]) {
    this.keys = texts.map((t) => `${openingKey(t)} `).sort();
  }

  /** Quantos textos começam com estas palavras. */
  count(words: string): number {
    const prefix = `${openingKey(words)} `;
    let lo = 0;
    let hi = this.keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.keys[mid]! < prefix) lo = mid + 1;
      else hi = mid;
    }
    let n = 0;
    for (let i = lo; i < this.keys.length && this.keys[i]!.startsWith(prefix); i++) n++;
    return n;
  }

  /** A menor abertura (entre `min` e `max` palavras) que só este texto tem. Null se nenhuma servir. */
  unique(text: string, min: number, max: number): string | null {
    for (let n = min; n <= max; n++) {
      const words = firstWords(text, n);
      if (words.split(' ').length < n) return null;
      if (this.count(words) === 1) return words;
    }
    return null;
  }
}
