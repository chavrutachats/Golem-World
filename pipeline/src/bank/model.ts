/**
 * Banco de perguntas (Fase 12): perguntas prontas nos três idiomas, cada uma presa a um
 * trecho do Sefaria. Saem de geradores que leem a estrutura e o texto do acervo (nunca de
 * memória) e de uma lista curta escrita à mão; as duas passam pelas mesmas checagens antes
 * de virar arquivo (pipeline/bank/*.jsonl) e, depois, linha no banco de dados.
 */
import { CategoryIdSchema, DifficultySchema, JourneyTrackSchema, LOCALES, OPTION_COUNT, SourceLanguageSchema, type Locale } from '@trivia/shared';
import { z } from 'zod';

export const BANK_LOCALES = LOCALES;
export type BankLocale = Locale;

/** Trecho citado (a prova da resposta) ou mostrado acima da pergunta. */
export const QuoteSchema = z.object({
  text: z.string().trim().min(2).max(400),
  lang: SourceLanguageSchema,
  /** Versão do Sefaria de onde o trecho saiu, e a licença dela. */
  versionTitle: z.string().max(300),
  license: z.string().max(80),
});
export type Quote = z.infer<typeof QuoteSchema>;

export const LocalizedSchema = z.object({
  text: z.string().trim().min(8).max(300),
  options: z.array(z.string().trim().min(1).max(120)).length(OPTION_COUNT),
  explanation: z.string().trim().min(8).max(600),
  /** Prova da resposta: um pedaço literal do trecho de sourceRef. */
  evidence: QuoteSchema,
  /** Trecho mostrado acima da pergunta (opcional). */
  context: QuoteSchema.extend({ label: z.string().trim().min(1).max(160) }).nullable(),
});
export type Localized = z.infer<typeof LocalizedSchema>;

export const BankQuestionSchema = z.object({
  /** Estável: o mesmo gerador com os mesmos dados dá o mesmo id (reimportar não duplica). */
  id: z.string().regex(/^[a-z0-9-]+:[A-Za-z0-9_.:-]+$/),
  category: CategoryIdSchema,
  /** Trilha e parashiot do Golem World, quando a pergunta pertence a uma fase. */
  track: JourneyTrackSchema.nullable(),
  parashot: z.array(z.string()),
  difficulty: DifficultySchema,
  /** Gerador (ou "curated"). */
  kind: z.string().min(2).max(40),
  sourceRef: z.string().min(3).max(160),
  correctIndex: z.number().int().min(0).max(OPTION_COUNT - 1),
  i18n: z.object({ pt: LocalizedSchema, en: LocalizedSchema, he: LocalizedSchema }),
});
export type BankQuestion = z.infer<typeof BankQuestionSchema>;

/** O que um gerador devolve antes de embaralhar: a resposta certa vem sempre na posição 0. */
export interface Draft {
  id: string;
  category: BankQuestion['category'];
  track?: BankQuestion['track'];
  parashot?: string[];
  difficulty: BankQuestion['difficulty'];
  kind: string;
  sourceRef: string;
  /** Alternativas numéricas: mostradas em ordem crescente em vez de embaralhadas. */
  numeric?: boolean;
  i18n: Record<BankLocale, Omit<Localized, 'options'> & { options: readonly string[] }>;
}
