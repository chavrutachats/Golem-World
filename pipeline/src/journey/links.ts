/**
 * Conexões do Sefaria entre versículos da Torá e outros textos (as "links" do
 * Sefaria-Export). São elas que dizem que Mishná Avot 5:1 fala de Gênesis 1, ou que
 * Bereshit Rabá 8:1 comenta Gênesis 1:26.
 *
 * O export traz ~4 milhões de conexões em links0.csv … links12.csv. O pipeline guarda
 * só as que ligam a Torá às trilhas, num arquivo bem menor: links/torah-links.csv.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { isTorahBook } from '@trivia/shared';

export const TORAH_LINKS_FILE = path.join('links', 'torah-links.csv');
export const LINK_CATEGORIES = new Set(['Mishnah', 'Talmud', 'Midrash', 'Kabbalah', 'Halakhah', 'Commentary', 'Tanakh']);

export interface TorahLink {
  torahRef: string;
  otherRef: string;
  otherText: string;
  otherCategory: string;
}

/** Divide uma linha CSV respeitando aspas (o export usa aspas em refs com vírgula). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Filtra uma linha de linksN.csv (Citation 1, Citation 2, Connection Type, Text 1,
 * Text 2, Category 1, Category 2). Devolve a conexão orientada Torá → outro texto.
 */
export function torahLinkFromRow(row: readonly string[]): TorahLink | null {
  if (row.length < 7) return null;
  const [c1, c2, , t1, t2, k1, k2] = row as [string, string, string, string, string, string, string];
  if (isTorahBook(t1) && !isTorahBook(t2) && LINK_CATEGORIES.has(k2)) {
    return { torahRef: c1, otherRef: c2, otherText: t2, otherCategory: k2 };
  }
  if (isTorahBook(t2) && !isTorahBook(t1) && LINK_CATEGORIES.has(k1)) {
    return { torahRef: c2, otherRef: c1, otherText: t1, otherCategory: k1 };
  }
  return null;
}

/** Lê os linksN.csv já baixados e grava só as conexões da Torá. */
export async function filterLinkFiles(sourceFiles: readonly string[], outFile: string): Promise<number> {
  await mkdir(path.dirname(outFile), { recursive: true });
  const out = createWriteStream(outFile, 'utf8');
  out.write('torahRef,otherRef,type,otherText,otherCategory\n');
  let kept = 0;
  for (const file of sourceFiles) {
    const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
    let header = true;
    for await (const line of rl) {
      if (header) {
        header = false;
        continue;
      }
      const link = torahLinkFromRow(parseCsvLine(line));
      if (!link) continue;
      out.write([link.torahRef, link.otherRef, '', link.otherText, link.otherCategory].map(csvCell).join(',') + '\n');
      kept++;
    }
  }
  await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  return kept;
}

export async function readTorahLinks(file: string): Promise<TorahLink[]> {
  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  const out: TorahLink[] = [];
  let header = true;
  for await (const line of rl) {
    if (header) {
      header = false;
      continue;
    }
    const [torahRef, otherRef, , otherText, otherCategory] = parseCsvLine(line);
    if (torahRef && otherRef && otherText && otherCategory) out.push({ torahRef, otherRef, otherText, otherCategory });
  }
  return out;
}

/**
 * Expande a referência de um texto qualquer nas referências de segmento que ela cobre,
 * no mesmo formato que a ingestão produz ("Sanhedrin 38a:5", "Bereshit Rabbah 8:1").
 * Intervalos dentro da mesma seção ("Sanhedrin 38a:5-7") viram cada segmento; uma
 * seção inteira ("Sanhedrin 38a") fica como prefixo, casando com todos os segmentos dela.
 */
export function expandOtherRef(ref: string): { exact: string[]; prefixes: string[] } {
  const m = /^(.*\S)\s+(\d+[ab]?(?::\d+)*)(?:-(\d+[ab]?(?::\d+)*))?$/.exec(ref.trim());
  if (!m) return { exact: [], prefixes: [] };
  const title = m[1]!;
  const start = m[2]!.split(':');
  if (!m[3]) {
    return start.length >= 2 ? { exact: [`${title} ${start.join(':')}`], prefixes: [] } : { exact: [], prefixes: [`${title} ${start[0]}:`] };
  }
  const endParts = m[3].split(':');
  const end = [...start.slice(0, start.length - endParts.length), ...endParts];
  const sameParent = start.slice(0, -1).join(':') === end.slice(0, -1).join(':');
  const a = Number(start[start.length - 1]);
  const b = Number(end[end.length - 1]);
  if (start.length >= 2 && sameParent && Number.isInteger(a) && Number.isInteger(b) && b >= a && b - a <= 30) {
    const parent = start.slice(0, -1).join(':');
    return { exact: Array.from({ length: b - a + 1 }, (_, i) => `${title} ${parent}:${a + i}`), prefixes: [] };
  }
  return { exact: [`${title} ${start.join(':')}`], prefixes: [] };
}

/** Índice: referência de segmento → versículos da Torá ligados a ela. */
export class LinkIndex {
  private readonly exact = new Map<string, Set<string>>();
  private readonly prefixes = new Map<string, Set<string>>();
  readonly titles = new Map<string, string>();

  constructor(links: readonly TorahLink[]) {
    for (const link of links) {
      this.titles.set(link.otherText, link.otherCategory);
      const { exact, prefixes } = expandOtherRef(link.otherRef);
      for (const r of exact) this.add(this.exact, r, link.torahRef);
      for (const p of prefixes) this.add(this.prefixes, p, link.torahRef);
    }
  }

  private add(map: Map<string, Set<string>>, key: string, torahRef: string) {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    set.add(torahRef);
  }

  /** Versículos ligados ao segmento (pela referência exata ou pela seção dele). */
  anchorsFor(segmentRef: string): string[] {
    const out = new Set(this.exact.get(segmentRef) ?? []);
    const colon = segmentRef.lastIndexOf(':');
    if (colon > 0) for (const r of this.prefixes.get(segmentRef.slice(0, colon + 1)) ?? []) out.add(r);
    return [...out];
  }

  /** Títulos ligados à Torá numa categoria, sem os comentários sobre eles. */
  baseTitles(category: string): string[] {
    return [...this.titles.entries()]
      .filter(([title, cat]) => cat === category && !/ on /.test(title) && !title.startsWith('Steinsaltz'))
      .map(([title]) => title)
      .sort();
  }
}
