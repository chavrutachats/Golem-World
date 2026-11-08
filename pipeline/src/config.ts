/**
 * Configuração do pipeline, lida do `.env` da raiz do monorepo e validada com Zod.
 * Qualquer variável inválida derruba o comando logo no início, com mensagem clara.
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { MAX_QUESTIONS_PER_PASSAGE, SOURCE_LANGUAGES, type SourceLanguage } from '@trivia/shared';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const bool = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => ['1', 'true', 'yes', 'sim', 'on'].includes(v));

const list = (separator: string) =>
  z
    .string()
    .transform((v) =>
      v
        .split(separator)
        .map((s) => s.trim())
        .filter(Boolean),
    );

const ProviderSchema = z.enum(['anthropic', 'openai']);
export type ProviderName = z.infer<typeof ProviderSchema>;

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

  LLM_PROVIDER: ProviderSchema.default('anthropic'),
  LLM_VERIFIER_PROVIDER: z.union([ProviderSchema, z.literal('')]).default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),
  LLM_GENERATOR_MODEL: z.string().min(1).default('claude-sonnet-5-5'),
  LLM_VERIFIER_MODEL: z.string().min(1).default('claude-haiku-5-5'),
  LLM_USE_BATCH_API: bool.default(true),
  LLM_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(32000).default(4000),

  SEFARIA_EXPORT_PATH: z.string().min(1).default('./data/sefaria-export'),
  SEFARIA_EXPORT_BASE_URL: z.url().default('https://storage.googleapis.com/sefaria-export'),
  SEFARIA_BOOKS_INDEX_URL: z
    .url()
    .default('https://raw.githubusercontent.com/Sefaria/Sefaria-Export/master/books.json'),
  ALLOWED_LICENSES: list(',').default(['Public Domain', 'CC0', 'CC-BY', 'CC-BY-SA']),
  /** Versões liberadas pelo detentor dos direitos, mesmo com licença "unknown" (separadas por ";"). */
  SEFARIA_AUTHORIZED_VERSIONS: list(';').default([]),
  SOURCE_LANGUAGES: list(',')
    .pipe(z.array(z.enum(SOURCE_LANGUAGES)).min(1))
    .default(['he', 'en', 'pt']),

  QUESTION_LOCALE: z.string().min(2).default('pt-BR'),
  QUESTION_NAME_STYLE: z.enum(['portuguese', 'transliterated']).default('portuguese'),
  QUESTIONS_PER_PASSAGE: z.coerce.number().int().min(1).max(MAX_QUESTIONS_PER_PASSAGE).default(2),
  GENERATION_BATCH_SIZE: z.coerce.number().int().min(1).max(100_000).default(50),
  REQUIRE_HUMAN_REVIEW: bool.default(true),
  PIPELINE_OUT_DIR: z.string().min(1).default('./pipeline/out'),
});

export interface PipelineConfig {
  databaseUrl: string;
  llm: {
    generator: { provider: ProviderName; model: string };
    verifier: { provider: ProviderName; model: string };
    apiKeys: { anthropic: string; openai: string };
    useBatchApi: boolean;
    maxConcurrency: number;
    maxOutputTokens: number;
  };
  sefaria: {
    exportPath: string;
    exportBaseUrl: string;
    booksIndexUrl: string;
    allowedLicenses: string[];
    authorizedVersions: string[];
    languages: SourceLanguage[];
  };
  generation: {
    locale: string;
    nameStyle: 'portuguese' | 'transliterated';
    questionsPerPassage: number;
    batchSize: number;
    requireHumanReview: boolean;
  };
  outDir: string;
}

/** Carrega e valida a configuração. `env` é injetável para testes. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): PipelineConfig {
  if (env === process.env) {
    loadEnv({ path: path.join(REPO_ROOT, '.env'), quiet: true });
  }
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuração inválida no .env:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const resolvePath = (p: string) => (path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p));
  return {
    databaseUrl: e.DATABASE_URL,
    llm: {
      generator: { provider: e.LLM_PROVIDER, model: e.LLM_GENERATOR_MODEL },
      verifier: { provider: e.LLM_VERIFIER_PROVIDER || e.LLM_PROVIDER, model: e.LLM_VERIFIER_MODEL },
      apiKeys: { anthropic: e.ANTHROPIC_API_KEY, openai: e.OPENAI_API_KEY },
      useBatchApi: e.LLM_USE_BATCH_API,
      maxConcurrency: e.LLM_MAX_CONCURRENCY,
      maxOutputTokens: e.LLM_MAX_OUTPUT_TOKENS,
    },
    sefaria: {
      exportPath: resolvePath(e.SEFARIA_EXPORT_PATH),
      exportBaseUrl: e.SEFARIA_EXPORT_BASE_URL.replace(/\/+$/, ''),
      booksIndexUrl: e.SEFARIA_BOOKS_INDEX_URL,
      allowedLicenses: e.ALLOWED_LICENSES,
      authorizedVersions: e.SEFARIA_AUTHORIZED_VERSIONS,
      languages: e.SOURCE_LANGUAGES,
    },
    generation: {
      locale: e.QUESTION_LOCALE,
      nameStyle: e.QUESTION_NAME_STYLE,
      questionsPerPassage: e.QUESTIONS_PER_PASSAGE,
      batchSize: e.GENERATION_BATCH_SIZE,
      requireHumanReview: e.REQUIRE_HUMAN_REVIEW,
    },
    outDir: resolvePath(e.PIPELINE_OUT_DIR),
  };
}
