/**
 * Gravação dos resultados do motor no banco: perguntas (inclusive as reprovadas,
 * para auditoria e ajuste do prompt) e o novo estado da passagem.
 */
import type { Prisma, PrismaClient, SourcePassage } from '@trivia/db';
import { localeFromTag, type SourceLanguage } from '@trivia/shared';
import { rejectionCodes, type PassageOutcome, type PassageInput } from './engine.js';

export interface BatchStats {
  passages: number;
  generated: number;
  skipped: number;
  failed: number;
  questions: { total: number; approved: number; pending_review: number; rejected: number; duplicates: number };
  rejectionReasons: Record<string, number>;
  usage: { inputTokens: number; outputTokens: number };
}

export function emptyStats(): BatchStats {
  return {
    passages: 0,
    generated: 0,
    skipped: 0,
    failed: 0,
    questions: { total: 0, approved: 0, pending_review: 0, rejected: 0, duplicates: 0 },
    rejectionReasons: {},
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

/** Converte a linha do banco no formato que o motor usa. */
export function toPassageInput(p: SourcePassage): PassageInput {
  const segments = Array.isArray(p.segments) ? (p.segments as unknown as PassageInput['segments']) : [];
  return {
    id: p.id,
    ref: p.ref,
    bookTitle: p.bookTitle,
    category: p.category,
    segments: segments.length
      ? segments
      : [{ ref: p.ref, ...(p.heText ? { he: p.heText } : {}), ...(p.enText ? { en: p.enText } : {}), ...(p.ptText ? { pt: p.ptText } : {}) }],
    heText: p.heText,
    enText: p.enText,
    ptText: p.ptText,
  };
}

export async function persistOutcome(
  prisma: PrismaClient,
  passage: PassageInput,
  outcome: PassageOutcome,
  batchId: string | null,
  locale: string,
  stats: BatchStats,
): Promise<void> {
  stats.passages++;
  stats.usage.inputTokens += outcome.usage.inputTokens;
  stats.usage.outputTokens += outcome.usage.outputTokens;
  stats[outcome.passageStatus]++;

  const keys = outcome.candidates.map((c) => c.dedupeKey);
  const existing = keys.length
    ? new Set(
        (await prisma.question.findMany({ where: { dedupeKey: { in: keys } }, select: { dedupeKey: true } })).map(
          (q) => q.dedupeKey,
        ),
      )
    : new Set<string>();

  const rows: Prisma.QuestionCreateManyInput[] = [];
  for (const c of outcome.candidates) {
    if (existing.has(c.dedupeKey)) {
      stats.questions.duplicates++;
      continue;
    }
    stats.questions.total++;
    stats.questions[c.status]++;
    for (const code of rejectionCodes(c)) stats.rejectionReasons[code] = (stats.rejectionReasons[code] ?? 0) + 1;
    const q = c.question;
    rows.push({
      passageId: passage.id,
      batchId,
      // Fase 8: o idioma vai em código curto (pt, en, he), não "pt-BR".
      locale: localeFromTag(locale),
      category: passage.category,
      text: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      sourceRef: q.sourceRef,
      evidenceQuote: q.evidenceQuote,
      evidenceLanguage: q.evidenceLanguage satisfies SourceLanguage,
      aiDifficulty: q.difficulty,
      difficulty: q.difficulty,
      difficultyRationale: q.difficultyRationale,
      status: c.status,
      validationReport: {
        errors: c.validation.errors,
        warnings: c.validation.warnings,
        rejectionCodes: rejectionCodes(c),
        verification: c.verification ?? null,
      } as unknown as Prisma.InputJsonValue,
      verifierConfidence: c.verification?.result?.confidence ?? null,
      dedupeKey: c.dedupeKey,
    });
  }

  await prisma.$transaction([
    ...(rows.length ? [prisma.question.createMany({ data: rows, skipDuplicates: true })] : []),
    prisma.sourcePassage.update({
      where: { id: passage.id },
      data: {
        status: outcome.passageStatus,
        lastError: outcome.error ?? (outcome.passageStatus === 'skipped' ? `skip: ${outcome.skipReason}` : null),
        generatedAt: new Date(),
        ...(batchId ? { lastBatchId: batchId } : {}),
      },
    }),
  ]);
}
