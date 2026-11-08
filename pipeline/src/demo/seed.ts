/**
 * Carrega (ou remove) as perguntas de demonstração.
 *
 * - Se os livros ainda não foram ingeridos, ingere os trechos de pipeline/fixtures
 *   (os mesmos textos reais usados nos testes).
 * - Se já foram ingeridos a partir do export completo, usa as passagens existentes.
 * - Cada pergunta passa pela validação do pipeline; qualquer falha interrompe tudo.
 * - Por padrão entram como "aguardando revisão", como as geradas por IA.
 */
import type { Prisma, PrismaClient, SourcePassage } from '@trivia/db';
import { dedupeFingerprint, validateGeneratedQuestion } from '@trivia/shared';
import path from 'node:path';
import { REPO_ROOT, type PipelineConfig } from '../config.js';
import { sourceTextsFor } from '../generation/engine.js';
import { toPassageInput } from '../generation/persist.js';
import { ingest } from '../ingest/ingest.js';
import { sha256 } from '../util.js';
import { DEMO_QUESTIONS } from './questions.js';

export const DEMO_PROVIDER = 'demo';
export const DEMO_EXPORT_PATH = path.join(REPO_ROOT, 'pipeline', 'fixtures', 'sefaria-export');
const DEMO_BOOKS = ['Genesis', 'Mishnah Berakhot', 'Berakhot'];

function bookOf(ref: string): string {
  return ref.replace(/\s+\d+[ab]?(?::\d+)*(?:-.+)?$/, '');
}

function findPassage(passages: SourcePassage[], ref: string): SourcePassage | undefined {
  return passages.find((p) => {
    const segments = Array.isArray(p.segments) ? (p.segments as { ref?: string }[]) : [];
    return segments.some((s) => s.ref === ref);
  });
}

export interface SeedResult {
  ingestedFixtures: string[];
  created: number;
  skipped: number;
  status: 'approved' | 'pending_review';
}

export async function seedDemo(config: PipelineConfig, prisma: PrismaClient, { approve = false } = {}): Promise<SeedResult> {
  const present = await prisma.sourcePassage.groupBy({ by: ['bookTitle'], where: { bookTitle: { in: DEMO_BOOKS } } });
  const missing = DEMO_BOOKS.filter((b) => !present.some((p) => p.bookTitle === b));
  if (missing.length) {
    await ingest({ ...config, sefaria: { ...config.sefaria, exportPath: DEMO_EXPORT_PATH } }, prisma, { titles: missing });
  }
  const passages = await prisma.sourcePassage.findMany({ where: { bookTitle: { in: DEMO_BOOKS } } });

  // Valida tudo antes de gravar qualquer coisa.
  const rows = DEMO_QUESTIONS.map((q) => {
    const passage = findPassage(passages, q.sourceRef);
    if (!passage) throw new Error(`Passagem com ${q.sourceRef} não encontrada (livro ${bookOf(q.sourceRef)}).`);
    const input = toPassageInput(passage);
    const report = validateGeneratedQuestion(q, sourceTextsFor(input, q.sourceRef), [passage.ref, ...input.segments.map((s) => s.ref)]);
    if (!report.ok) {
      throw new Error(`Pergunta de demonstração inválida (${q.sourceRef}): ${report.errors.map((e) => e.message).join(' ')}`);
    }
    return { q, passage, report };
  });

  const batch = await prisma.generationBatch.create({
    data: {
      provider: DEMO_PROVIDER,
      generatorModel: 'escritas à mão',
      promptVersion: 'demo@1',
      status: 'completed',
      completedAt: new Date(),
    },
  });
  const status = approve ? 'approved' : 'pending_review';
  const result = await prisma.question.createMany({
    skipDuplicates: true,
    data: rows.map(({ q, passage, report }) => ({
      passageId: passage.id,
      batchId: batch.id,
      locale: config.generation.locale,
      category: passage.category,
      text: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      sourceRef: q.sourceRef,
      evidenceQuote: q.evidenceQuote,
      evidenceLanguage: q.evidenceLanguage,
      aiDifficulty: q.difficulty,
      difficulty: q.difficulty,
      difficultyRationale: q.difficultyRationale,
      status,
      validationReport: { errors: [], warnings: report.warnings, rejectionCodes: [], verification: null, demo: true } as unknown as Prisma.InputJsonValue,
      dedupeKey: sha256(dedupeFingerprint(q.question, q.options[q.correctIndex] ?? '')),
    })),
  });
  if (result.count === 0) await prisma.generationBatch.delete({ where: { id: batch.id } });
  return { ingestedFixtures: missing, created: result.count, skipped: rows.length - result.count, status };
}

/** Remove as perguntas de demonstração (as que já foram jogadas são só retiradas de circulação). */
export async function removeDemo(prisma: PrismaClient): Promise<{ deleted: number; retired: number }> {
  const batches = await prisma.generationBatch.findMany({ where: { provider: DEMO_PROVIDER }, select: { id: true } });
  const batchIds = batches.map((b) => b.id);
  const retired = await prisma.question.updateMany({
    where: { batchId: { in: batchIds }, plays: { some: {} } },
    data: { status: 'retired' },
  });
  const deleted = await prisma.question.deleteMany({ where: { batchId: { in: batchIds }, plays: { none: {} } } });
  await prisma.generationBatch.deleteMany({ where: { id: { in: batchIds }, questions: { none: {} } } });
  return { deleted: deleted.count, retired: retired.count };
}
