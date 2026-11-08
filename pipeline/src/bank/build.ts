/**
 * Monta o banco: roda os geradores e as perguntas escritas à mão, confere cada uma e grava
 * pipeline/bank/<categoria>.jsonl (uma pergunta por linha, ordenadas pelo id, para o diff
 * do git mostrar só o que mudou).
 *
 * Conferências (uma falha tira a pergunta e aparece no relatório):
 *  - formato (zod), 4 alternativas distintas em cada idioma, nada de "todas as anteriores";
 *  - Nomes Divinos nos textos escritos (pergunta, alternativas, explicação), nos 3 idiomas;
 *  - a evidência e o trecho mostrado existem, literalmente, no segmento de sourceRef, na
 *    versão citada (comparação sem nikud nem pontuação, como no resto do pipeline);
 *  - nada repetido (mesmo id, ou mesma pergunta com a mesma resposta).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CATEGORY_IDS, evidenceMatches, findDivineNameIssues, normalizeForMatch, type CategoryId } from '@trivia/shared';
import { Corpus } from './corpus.js';
import { finalize, LOCALES, rngFor } from './kit.js';
import { BankQuestionSchema, type BankQuestion, type Draft, type Quote } from './model.js';
import { torahGenerators } from './gen/torah.js';
import { nachGenerators } from './gen/nach.js';
import { mishnahGenerators } from './gen/mishnah.js';
import { talmudGenerators } from './gen/talmud.js';
import { halakhahGenerators } from './gen/halakhah.js';
import { midrashGenerators, type MidrashContext } from './gen/midrash.js';
import { loadCurated } from './curated.js';

export const BANK_DIR = path.resolve(import.meta.dirname, '../../bank');

/**
 * Teto por gerador: os geradores de "de onde é este trecho" rendem milhares de perguntas
 * parecidas; acima disto, fica uma amostra fixa (sorteada pelo id), para o banco não virar
 * uma pergunta só repetida.
 */
export const MAX_PER_KIND = 800;

const BANNED = [/todas as (anteriores|alternativas)/i, /nenhuma das (anteriores|alternativas)/i, /all of the above/i, /none of the above/i];

export interface BuildReport {
  kept: Record<CategoryId, number>;
  byKind: Record<string, number>;
  byDifficulty: Record<CategoryId, Record<string, number>>;
  rejected: { id: string; reason: string }[];
}

/**
 * Título do livro de uma referência ("Mishnah Berakhot 1:1" → "Mishnah Berakhot";
 * "Midrash Tanchuma, Noach 3:1" → "Midrash Tanchuma").
 */
export function bookOfRef(corpus: Corpus, ref: string): string {
  const head = ref.slice(0, ref.lastIndexOf(' '));
  if (corpus.has(head)) return head;
  const comma = head.lastIndexOf(', ');
  return comma > 0 && corpus.has(head.slice(0, comma)) ? head.slice(0, comma) : head;
}

export function checkQuote(corpus: Corpus, ref: string, q: Quote, what: string): string | null {
  if (q.lang === 'pt') return `${what}: o acervo não tem texto em português liberado`;
  const title = bookOfRef(corpus, ref);
  const book = corpus.text(title, q.lang);
  if (!book) return `${what}: livro ${title} sem texto em ${q.lang}`;
  if (book.versionTitle !== q.versionTitle) return `${what}: versão "${q.versionTitle}" não é a escolhida (${book.versionTitle})`;
  const seg = book.byRef.get(ref);
  if (!seg) return `${what}: ${ref} não existe em ${q.lang}`;
  if (!evidenceMatches(seg.text, q.text, { minWords: 1 })) return `${what}: o trecho não está em ${ref} (${q.lang})`;
  return null;
}

const hashOf = (id: string) => rngFor(`sample|${id}`)();

/** Duas perguntas são a mesma se pedem a mesma coisa (enunciado e trecho) e têm a mesma resposta. */
function sameness(q: BankQuestion): string {
  const pt = q.i18n.pt;
  return [pt.text, pt.context?.text ?? '', pt.options[q.correctIndex]!].map(normalizeForMatch).join('|');
}

export function validate(corpus: Corpus, q: BankQuestion): string | null {
  const parsed = BankQuestionSchema.safeParse(q);
  if (!parsed.success) return `formato: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`;
  for (const l of LOCALES) {
    const loc = q.i18n[l];
    const norm = loc.options.map(normalizeForMatch);
    if (new Set(norm).size !== norm.length) return `${l}: alternativas repetidas`;
    if (loc.options.some((o) => BANNED.some((re) => re.test(o)))) return `${l}: alternativa proibida`;
    for (const s of [loc.text, loc.explanation, ...loc.options, loc.context?.label ?? '']) {
      const issues = findDivineNameIssues(s);
      if (issues.length) return `${l}: ${issues[0]!.message}`;
    }
    const e = checkQuote(corpus, q.sourceRef, loc.evidence, `${l} evidência`);
    if (e) return e;
    if (loc.context) {
      const c = checkQuote(corpus, q.sourceRef, loc.context, `${l} trecho`);
      if (c) return c;
    }
  }
  return null;
}

export function buildBank(corpus: Corpus, opts: { only?: readonly CategoryId[]; midrash?: MidrashContext } = {}): { questions: BankQuestion[]; report: BuildReport } {
  const report: BuildReport = {
    kept: Object.fromEntries(CATEGORY_IDS.map((c) => [c, 0])) as Record<CategoryId, number>,
    byKind: {},
    byDifficulty: Object.fromEntries(CATEGORY_IDS.map((c) => [c, {}])) as BuildReport['byDifficulty'],
    rejected: [],
  };
  const want = (c: CategoryId) => !opts.only?.length || opts.only.includes(c);
  const drafts: Draft[] = [];
  const run = (c: CategoryId, fn: () => Draft[]) => {
    if (want(c)) drafts.push(...fn());
  };
  run('torah', () => torahGenerators(corpus));
  run('neviim_ketuvim', () => nachGenerators(corpus));
  run('mishnah', () => mishnahGenerators(corpus));
  run('talmud', () => talmudGenerators(corpus));
  run('halakhah', () => halakhahGenerators(corpus));
  run('midrash_aggadah', () => midrashGenerators(corpus, opts.midrash));
  const loaded = loadCurated(corpus, path.join(BANK_DIR, 'curated'));
  for (const e of loaded.errors) report.rejected.push({ id: 'curated', reason: e });
  const curated = loaded.questions.filter((q) => want(q.category));

  // Amostra fixa dos geradores que passam do teto.
  const byKind = new Map<string, Draft[]>();
  for (const d of drafts) byKind.set(d.kind, [...(byKind.get(d.kind) ?? []), d]);
  drafts.length = 0;
  for (const list of byKind.values()) {
    const keep = list.length <= MAX_PER_KIND ? list : [...list].sort((a, b) => hashOf(a.id) - hashOf(b.id)).slice(0, MAX_PER_KIND);
    drafts.push(...keep);
  }

  const seenIds = new Set<string>();
  const seenText = new Set<string>();
  const questions: BankQuestion[] = [];
  for (const q of [...drafts.map(finalize), ...curated]) {
    const reason =
      (seenIds.has(q.id) ? 'id repetido' : null) ??
      (seenText.has(sameness(q)) ? 'pergunta repetida' : null) ??
      validate(corpus, q);
    if (reason) {
      report.rejected.push({ id: q.id, reason });
      continue;
    }
    seenIds.add(q.id);
    seenText.add(sameness(q));
    questions.push(q);
    report.kept[q.category]++;
    report.byKind[q.kind] = (report.byKind[q.kind] ?? 0) + 1;
    report.byDifficulty[q.category][q.difficulty] = (report.byDifficulty[q.category][q.difficulty] ?? 0) + 1;
  }
  questions.sort((a, b) => a.id.localeCompare(b.id));
  return { questions, report };
}

export function writeBank(questions: readonly BankQuestion[], dir = BANK_DIR, only?: readonly CategoryId[]): void {
  mkdirSync(dir, { recursive: true });
  for (const c of CATEGORY_IDS) {
    if (only?.length && !only.includes(c)) continue;
    const rows = questions.filter((q) => q.category === c).map((q) => JSON.stringify(q));
    writeFileSync(path.join(dir, `${c}.jsonl`), rows.length ? `${rows.join('\n')}\n` : '');
  }
}

export function readBank(dir = BANK_DIR): BankQuestion[] {
  const out: BankQuestion[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.jsonl')).sort()) {
    for (const line of readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (line.trim()) out.push(BankQuestionSchema.parse(JSON.parse(line)));
    }
  }
  return out;
}
