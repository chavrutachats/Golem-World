/**
 * Prompts do gerador e do verificador.
 *
 * O texto das regras vive em `pipeline/prompts/*.system.md` (versionados, com
 * front matter `version`), para poder ser revisado sem mexer em código. Aqui ficam
 * só a renderização dos placeholders e a montagem da mensagem de cada passagem.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CATEGORIES,
  DIFFICULTIES,
  DIFFICULTY_LABELS_PT,
  DIFFICULTY_RUBRIC,
  DIVINE_NAME_STYLE_PT,
  type CategoryId,
  type SourceLanguage,
} from '@trivia/shared';
import { REPO_ROOT } from './config.js';

export interface PromptTemplate {
  id: string;
  version: string;
  body: string;
}

export function parsePromptFile(content: string): PromptTemplate {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(content);
  if (!match) throw new Error('Prompt sem front matter (---).');
  const meta = Object.fromEntries(
    match[1]!
      .split('\n')
      .map((line) => line.split(':').map((s) => s.trim()))
      .filter((parts) => parts.length >= 2)
      .map(([k, ...v]) => [k, v.join(':')]),
  );
  if (!meta.id || !meta.version) throw new Error('Prompt sem "id" ou "version" no front matter.');
  return { id: meta.id, version: meta.version, body: match[2]!.trim() };
}

export function loadPrompt(name: 'generator' | 'verifier'): PromptTemplate {
  return parsePromptFile(readFileSync(path.join(REPO_ROOT, 'pipeline', 'prompts', `${name}.system.md`), 'utf8'));
}

export function renderTemplate(body: string, vars: Record<string, string | number>): string {
  const out = body.replace(/\{\{([A-Z_]+)\}\}/g, (whole, key: string) => {
    if (!(key in vars)) throw new Error(`Placeholder sem valor no prompt: ${whole}`);
    return String(vars[key]);
  });
  return out;
}

export const NAME_STYLE_RULES = {
  portuguese:
    'Use a grafia portuguesa consagrada dos nomes bíblicos (Abraão, Isaque, Moisés, Jerusalém) e a transliteração usual para termos sem equivalente consagrado (Shabat, Pessach, tefilin, Shemá).',
  transliterated:
    'Use a transliteração hebraica usual dos nomes (Avraham, Itschak, Moshé, Yerushalayim) e dos termos (Shabat, Pessach, tefilin, Shemá).',
} as const;

export interface GeneratorPromptOptions {
  locale: string;
  maxQuestions: number;
  nameStyle: keyof typeof NAME_STYLE_RULES;
}

export function renderGeneratorSystem(template: PromptTemplate, options: GeneratorPromptOptions): string {
  const rubric = DIFFICULTIES.map(
    (d) => `- \`${d}\` (${DIFFICULTY_LABELS_PT[d]}): ${DIFFICULTY_RUBRIC[d]}`,
  ).join('\n');
  return renderTemplate(template.body, {
    LOCALE: options.locale,
    MAX_QUESTIONS: options.maxQuestions,
    NAME_STYLE_RULE: NAME_STYLE_RULES[options.nameStyle],
    GOD_PT: DIVINE_NAME_STYLE_PT.god,
    TETRAGRAMMATON_PT: DIVINE_NAME_STYLE_PT.tetragrammaton,
    DIFFICULTY_RUBRIC: rubric,
  });
}

export function renderVerifierSystem(template: PromptTemplate): string {
  return renderTemplate(template.body, {});
}

/** Orientação específica por categoria, acrescentada à mensagem de cada passagem. */
export const CATEGORY_GUIDANCE: Readonly<Record<CategoryId, string>> = {
  torah: 'Trecho da Torá. Foque em personagens, acontecimentos, falas e mandamentos explícitos.',
  neviim_ketuvim: 'Trecho dos Profetas ou dos Escritos. Foque em personagens, acontecimentos, falas e ensinamentos explícitos.',
  mishnah: 'Trecho da Mishná. Foque na regra estabelecida, nas opiniões dos sábios citados (quem disse o quê) e nos casos descritos.',
  talmud:
    'Trecho do Talmud Bavli. Foque em quem disse o quê, na pergunta e na resposta da discussão, no caso ou ensinamento apresentado. Só pergunte o sentido de um termo aramaico se o próprio trecho o explicar.',
  halakhah: 'Trecho de Halachá (Mishnê Torá ou Shulchan Aruch). Pergunte o que o texto estabelece, sempre atribuindo a regra ao texto.',
  midrash_aggadah: 'Trecho de Midrash. Foque no ensinamento, na parábola (mashal) e em quem ensinou, conforme o texto.',
};

export interface PromptSegment {
  ref: string;
  he?: string;
  en?: string;
  pt?: string;
}

export interface PromptPassage {
  ref: string;
  bookTitle: string;
  category: CategoryId;
  segments: PromptSegment[];
}

const LANGS: readonly SourceLanguage[] = ['he', 'en', 'pt'];

/** Remove sinais que confundiriam a marcação da mensagem; o texto já vem sem HTML. */
function safe(text: string): string {
  return text.replace(/[<>]/g, '');
}

function attr(value: string): string {
  return value.replace(/"/g, "'");
}

export function renderPassageXml(passage: PromptPassage): string {
  const segments = passage.segments
    .map((s) => {
      const langs = LANGS.filter((l) => s[l]).map((l) => `<${l}>${safe(s[l]!)}</${l}>`);
      return `<segment ref="${attr(s.ref)}">\n${langs.join('\n')}\n</segment>`;
    })
    .join('\n');
  return `<passage ref="${attr(passage.ref)}" book="${attr(passage.bookTitle)}" category="${CATEGORIES[passage.category].labelPt}">\n${segments}\n</passage>`;
}

export function buildGeneratorUserMessage(passage: PromptPassage, maxQuestions: number): string {
  return [
    renderPassageXml(passage),
    '',
    '<context>',
    `Categoria: ${CATEGORIES[passage.category].labelPt}. ${CATEGORY_GUIDANCE[passage.category]}`,
    `Gere até ${maxQuestions} pergunta(s) para este trecho, seguindo todas as regras, ou recuse-o com skipReason.`,
    '</context>',
  ].join('\n');
}

export function buildVerifierUserMessage(passage: PromptPassage, question: string, options: readonly string[]): string {
  const opts = options.map((o, i) => `<option index="${i}">${safe(o)}</option>`).join('\n');
  return [renderPassageXml(passage), '', '<question>', `<text>${safe(question)}</text>`, opts, '</question>'].join('\n');
}
