/**
 * Perguntas escritas à mão (pipeline/bank/curated/*.json). Cada entrada traz a pergunta
 * nos três idiomas com a resposta certa em primeiro lugar, a referência e o pedaço do
 * texto que a prova (em hebraico e, se quiser, em inglês); a versão e a licença vêm do
 * acervo na hora do build, e as mesmas conferências dos geradores valem para elas.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CategoryIdSchema, DifficultySchema, JourneyTrackSchema, type Locale } from '@trivia/shared';
import type { Corpus } from './corpus.js';
import { finalize, perLocale, quoteOf } from './kit.js';
import type { BankQuestion, Draft } from './model.js';

const Loc = z.object({ q: z.string(), a: z.array(z.string()).length(4), x: z.string() });
export const CuratedSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  category: CategoryIdSchema,
  track: JourneyTrackSchema.optional(),
  parashot: z.array(z.string()).optional(),
  difficulty: DifficultySchema,
  ref: z.string(),
  /** Pedaço literal do texto hebraico de `ref` (vale como evidência em pt e he). */
  he: z.string(),
  /** Pedaço literal da tradução inglesa de `ref` (evidência em en); sem ela, o en cita o hebraico. */
  en: z.string().optional(),
  pt_: Loc,
  en_: Loc,
  he_: Loc,
});
export type Curated = z.infer<typeof CuratedSchema>;

export function curatedDraft(corpus: Corpus, c: Curated): Draft | { error: string } {
  const title = c.ref.slice(0, c.ref.lastIndexOf(' '));
  const heBook = corpus.text(title, 'he');
  if (!heBook) return { error: `${c.id}: sem texto hebraico de ${title}` };
  const enBook = c.en ? corpus.text(title, 'en') : null;
  const loc = (l: Locale) => (l === 'pt' ? c.pt_ : l === 'en' ? c.en_ : c.he_);
  return {
    id: `curated:${c.id}`,
    category: c.category,
    track: c.track ?? null,
    parashot: c.parashot ?? [],
    difficulty: c.difficulty,
    kind: 'curated',
    sourceRef: c.ref,
    i18n: perLocale((l) => ({
      text: loc(l).q,
      options: loc(l).a,
      explanation: loc(l).x,
      evidence: l === 'en' && c.en && enBook ? quoteOf(enBook, c.en) : quoteOf(heBook, c.he),
      context: null,
    })),
  };
}

export function loadCurated(corpus: Corpus, dir: string): { questions: BankQuestion[]; errors: string[] } {
  const questions: BankQuestion[] = [];
  const errors: string[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return { questions, errors };
  }
  for (const f of files) {
    const rows = z.array(CuratedSchema).safeParse(JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
    if (!rows.success) {
      errors.push(`${f}: ${rows.error.issues[0]?.path.join('.')} ${rows.error.issues[0]?.message}`);
      continue;
    }
    for (const c of rows.data) {
      const d = curatedDraft(corpus, c);
      if ('error' in d) errors.push(d.error);
      else questions.push(finalize(d));
    }
  }
  return { questions, errors };
}
