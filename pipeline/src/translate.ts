/**
 * Tradução em lote (Fase 8): `pnpm pipeline translate`.
 *
 * Traduz para pt ou en os textos de estudo que ainda não têm texto nesse idioma
 * (por padrão, a Torá inteira, na ordem da leitura) e, com --questions, as perguntas
 * aprovadas do motor de IA para en ou he. Usa o mesmo prompt e as mesmas checagens
 * da API (@trivia/shared/translation), então o que a API traduziria na tela de
 * preparo fica pronto antes e ninguém espera.
 */
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@trivia/db';
import {
  QuestionTranslationOutputSchema,
  SegmentTranslationOutputSchema,
  TORAH_BOOKS,
  TRANSLATION_PROMPT_VERSION,
  checkQuestionTranslation,
  checkSegmentTranslation,
  questionSystemPrompt,
  questionUserPrompt,
  segmentSystemPrompt,
  segmentUserPrompt,
  type JourneyTrack,
  type Locale,
  type QuestionToTranslate,
  type SegmentToTranslate,
  type TranslatedLocale,
} from '@trivia/shared';
import { parseModelJson, toProviderJsonSchema } from './llm/json-schema.js';
import type { LlmProvider } from './llm/types.js';
import { errorMessage, log, mapWithConcurrency } from './util.js';

const BATCH = 12;

export interface TranslateOptions {
  locale: TranslatedLocale;
  tracks: JourneyTrack[];
  parashaId?: string;
  limit: number;
  concurrency: number;
  dryRun: boolean;
}

export interface TranslateStats {
  segments: number;
  translated: number;
  rejected: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
}

const SEGMENT_SCHEMA = toProviderJsonSchema(SegmentTranslationOutputSchema);
const QUESTION_SCHEMA = toProviderJsonSchema(QuestionTranslationOutputSchema);

export async function translateSegments(provider: LlmProvider, prisma: PrismaClient, options: TranslateOptions): Promise<TranslateStats> {
  const stats: TranslateStats = { segments: 0, translated: 0, rejected: 0, failed: 0, inputTokens: 0, outputTokens: 0 };
  const native = options.locale === 'pt' ? { ptText: null } : { enText: null };
  const rows: { id: string; ref: string; heText: string | null; heLicense: string | null; enText: string | null; enLicense: string | null; contentHash: string }[] = [];
  // Torá primeiro, na ordem dos livros; depois as outras trilhas pedidas.
  const order = [...options.tracks].sort((a, b) => Number(b === 'torah') - Number(a === 'torah'));
  for (const track of order) {
    const books = track === 'torah' ? [...TORAH_BOOKS] : [undefined];
    for (const book of books) {
      if (rows.length >= options.limit) break;
      const found = await prisma.studyText.findMany({
        where: {
          track,
          ...(book ? { bookTitle: book } : {}),
          ...(options.parashaId ? { parashot: { has: options.parashaId } } : {}),
          ...native,
          OR: [{ heText: { not: null } }, { enText: { not: null } }],
        },
        orderBy: [{ bookTitle: 'asc' }, { sequence: 'asc' }],
        select: {
          id: true,
          ref: true,
          heText: true,
          heLicense: true,
          enText: true,
          enLicense: true,
          contentHash: true,
          translations: { where: { locale: options.locale }, select: { sourceHash: true } },
        },
      });
      for (const r of found) {
        if (rows.length >= options.limit) break;
        if (r.translations[0]?.sourceHash === r.contentHash) continue;
        rows.push(r);
      }
    }
  }
  stats.segments = rows.length;
  if (options.dryRun || !rows.length) return stats;

  const batches: (typeof rows)[] = [];
  for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));
  let done = 0;
  await mapWithConcurrency(batches, options.concurrency, async (batch) => {
    const items: SegmentToTranslate[] = batch.map((r) => ({ id: r.id, ref: r.ref, he: r.heText, en: r.enText }));
    try {
      const sourceChars = items.reduce((n, i) => n + (i.he?.length ?? 0) + (i.en?.length ?? 0), 0);
      const res = await provider.complete({
        system: segmentSystemPrompt(options.locale),
        user: segmentUserPrompt(items),
        jsonSchema: SEGMENT_SCHEMA,
        schemaName: 'segment_translations',
        maxOutputTokens: Math.min(16_000, 1_000 + Math.ceil(sourceChars * 1.6)),
        temperature: 0,
      });
      stats.inputTokens += res.usage?.inputTokens ?? 0;
      stats.outputTokens += res.usage?.outputTokens ?? 0;
      const out = new Map(parseModelJson(res.text, SegmentTranslationOutputSchema).items.map((i) => [i.id, i.text]));
      for (const row of batch) {
        const item = items.find((i) => i.id === row.id)!;
        const text = out.get(row.id);
        const problem = text === undefined ? 'missing' : checkSegmentTranslation(item, text, options.locale);
        if (problem) {
          stats.rejected++;
          log.warn(`${row.ref}: tradução reprovada (${problem}).`);
          continue;
        }
        const license = row.enLicense && row.enLicense !== row.heLicense ? `${row.heLicense ?? 'unknown'} + ${row.enLicense}` : row.heLicense;
        const data = {
          text: text!.trim(),
          sourceHash: row.contentHash,
          license: license?.slice(0, 80) ?? null,
          provider: provider.name,
          model: provider.model,
          promptVersion: TRANSLATION_PROMPT_VERSION,
          status: 'machine',
        };
        await prisma.segmentTranslation.upsert({
          where: { studyTextId_locale: { studyTextId: row.id, locale: options.locale } },
          create: { studyTextId: row.id, locale: options.locale, ...data },
          update: data,
        });
        stats.translated++;
      }
    } catch (err) {
      stats.failed += batch.length;
      log.warn(`Lote a partir de ${batch[0]!.ref} falhou: ${errorMessage(err)}`);
    }
    done += batch.length;
    if (done % (BATCH * 10) < BATCH) log.info(`  ${done}/${rows.length} trechos…`);
  });
  return stats;
}

export function questionHash(q: { text: string; options: string[]; explanation: string; evidenceQuote: string; contextLabel: string | null; contextText: string | null }): string {
  return createHash('sha256')
    .update(JSON.stringify([q.text, q.options, q.explanation, q.evidenceQuote, q.contextLabel, q.contextText]))
    .digest('hex');
}

export async function translateQuestions(
  provider: LlmProvider,
  prisma: PrismaClient,
  options: { locale: Locale; limit: number; concurrency: number; dryRun: boolean },
): Promise<TranslateStats> {
  const stats: TranslateStats = { segments: 0, translated: 0, rejected: 0, failed: 0, inputTokens: 0, outputTokens: 0 };
  const questions = await prisma.question.findMany({
    where: { status: 'approved', origin: 'llm', locale: { not: options.locale }, translations: { none: { locale: options.locale } } },
    orderBy: { createdAt: 'asc' },
    take: options.limit,
  });
  stats.segments = questions.length;
  if (options.dryRun) return stats;
  await mapWithConcurrency(questions, options.concurrency, async (q) => {
    const source: QuestionToTranslate = {
      id: q.id,
      text: q.text,
      options: q.options,
      explanation: q.explanation,
      evidenceQuote: q.evidenceQuote,
      contextLabel: q.contextLabel,
      contextText: q.contextText,
    };
    try {
      const res = await provider.complete({
        system: questionSystemPrompt(options.locale),
        user: questionUserPrompt(source),
        jsonSchema: QUESTION_SCHEMA,
        schemaName: 'question_translation',
        maxOutputTokens: 3_000,
        temperature: 0,
      });
      stats.inputTokens += res.usage?.inputTokens ?? 0;
      stats.outputTokens += res.usage?.outputTokens ?? 0;
      const out = parseModelJson(res.text, QuestionTranslationOutputSchema);
      const problem = checkQuestionTranslation(source, out, options.locale);
      if (problem) {
        stats.rejected++;
        log.warn(`Pergunta ${q.id}: tradução reprovada (${problem}).`);
        return;
      }
      const data = {
        text: out.text.trim(),
        options: out.options.map((o) => o.trim()),
        explanation: out.explanation.trim(),
        evidenceQuote: out.evidenceQuote.trim(),
        contextLabel: out.contextLabel?.trim() ?? null,
        contextText: out.contextText?.trim() ?? null,
        sourceHash: questionHash(q),
        provider: provider.name,
        model: provider.model,
        promptVersion: TRANSLATION_PROMPT_VERSION,
        status: 'machine',
      };
      await prisma.questionTranslation.upsert({
        where: { questionId_locale: { questionId: q.id, locale: options.locale } },
        create: { questionId: q.id, locale: options.locale, ...data },
        update: data,
      });
      stats.translated++;
    } catch (err) {
      stats.failed++;
      log.warn(`Pergunta ${q.id}: ${errorMessage(err)}`);
    }
  });
  return stats;
}
