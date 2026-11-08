import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GeneratedQuestion } from '@trivia/shared';
import { loadConfig, type PipelineConfig } from '../src/config.js';

export const FIXTURE_EXPORT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'sefaria-export');

export function testConfig(overrides: Record<string, string> = {}): PipelineConfig {
  return loadConfig({
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://ninguem@localhost:1/nada',
    SEFARIA_EXPORT_PATH: FIXTURE_EXPORT,
    LLM_PROVIDER: 'anthropic',
    REQUIRE_HUMAN_REVIEW: 'false',
    ...overrides,
  });
}

/** Pergunta válida sobre Gênesis 1:3 ("Haja luz"), com evidência literal do JPS 1917. */
export function lightQuestion(overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion {
  return {
    question: 'No relato da criação em Bereshit, o que D\'us cria com a primeira fala do texto?',
    options: ['A luz', 'O firmamento', 'Os peixes', 'O ser humano'],
    correctIndex: 0,
    explanation: 'Gênesis 1:3 diz que D\'us disse "Haja luz" e houve luz.',
    sourceRef: 'Genesis 1:3',
    evidenceQuote: "Let there be light. And there was light",
    evidenceLanguage: 'en',
    difficulty: 'easy',
    difficultyRationale: 'Fato explícito e central do trecho.',
    ...overrides,
  };
}
