/**
 * Teste de ponta a ponta com PostgreSQL de verdade: ingestão → geração (síncrona e
 * em lote) → persistência → relatório → calibração. O LLM é simulado.
 *
 * Roda só quando TEST_DATABASE_URL aponta para um banco de teste já migrado
 * (ATENÇÃO: o teste apaga todas as tabelas desse banco).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '@trivia/db';
import { calibrate } from '../src/calibrate.js';
import type { Engine } from '../src/generation/engine.js';
import { collectBatches, runSync, selectPassages, submitBatch } from '../src/generation/run.js';
import { ingest } from '../src/ingest/ingest.js';
import { FakeProvider } from '../src/llm/fake.js';
import { loadPrompt } from '../src/prompts.js';
import { buildReviewReport } from '../src/report.js';
import { lightQuestion, testConfig } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('pipeline com banco de dados', () => {
  let prisma: PrismaClient;
  const config = testConfig();

  const generator = new FakeProvider(
    'fake-generator',
    (req) => {
      const ref = /<passage ref="([^"]+)"/.exec(req.user)![1]!;
      if (ref === 'Genesis 1:1-5') {
        return {
          passageRef: ref,
          questions: [lightQuestion(), lightQuestion({ question: 'Quantos dias durou a criação da luz?', evidenceQuote: 'seven days of light' })],
          skipReason: null,
        };
      }
      return { passageRef: ref, questions: [], skipReason: 'sem pergunta justa neste trecho' };
    },
    { batch: true },
  );
  const verifier = new FakeProvider('fake-verifier', (req) => {
    const options = [...req.user.matchAll(/<option index="(\d)">(.*?)<\/option>/g)].map((m) => m[2]);
    const idx = options.indexOf('A luz');
    return { chosenIndex: idx, defensibleIndexes: [idx], supportedByText: true, factualProblems: [], respectIssues: [], confidence: 0.9, notes: 'ok' };
  });
  const engine: Engine = {
    generator,
    verifier,
    generatorPrompt: loadPrompt('generator'),
    verifierPrompt: loadPrompt('verifier'),
    options: { locale: 'pt-BR', nameStyle: 'portuguese', questionsPerPassage: 2, maxOutputTokens: 4000, requireHumanReview: false },
  };

  beforeAll(async () => {
    prisma = createPrismaClient({ databaseUrl: url! });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "QuestionReport", "QuestionPlay", "Spin", "Turn", "GamePlayer", "Game", "RefreshToken", "QuestionReview", "Question", "GenerationBatch", "SourcePassage", "User" CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('ingere as fixtures e é idempotente', async () => {
    const first = await ingest(config, prisma);
    expect(first.reduce((n, r) => n + r.created, 0)).toBe(await prisma.sourcePassage.count());
    const second = await ingest(config, prisma);
    expect(second.reduce((n, r) => n + r.created + r.updated, 0)).toBe(0);
  });

  it('seleciona passagens na ordem do texto e por faixa de capítulos', async () => {
    const passages = await selectPassages(prisma, { titles: ['genesis'], sections: { from: 1, to: 1 }, limit: 2 });
    expect(passages.map((p) => p.ref)).toEqual(['Genesis 1:1-5', 'Genesis 1:6-10']);
  });

  it('gera em modo síncrono e grava perguntas aprovadas e reprovadas', async () => {
    const passages = await selectPassages(prisma, { titles: ['Genesis'], sections: { from: 1, to: 1 }, limit: 2 });
    const { batchId, stats } = await runSync(engine, prisma, passages, { concurrency: 2, locale: 'pt-BR' });
    expect(stats).toMatchObject({ passages: 2, generated: 1, skipped: 1, questions: { approved: 1, rejected: 1 } });
    expect(stats.rejectionReasons).toEqual({ evidence_not_found: 1 });

    const questions = await prisma.question.findMany({ where: { batchId }, orderBy: { status: 'asc' } });
    expect(questions.map((q) => q.status).sort()).toEqual(['approved', 'rejected']);
    const approved = questions.find((q) => q.status === 'approved')!;
    expect(approved).toMatchObject({ sourceRef: 'Genesis 1:3', aiDifficulty: 'easy', difficulty: 'easy', evidenceLanguage: 'en' });
    expect(approved.verifierConfidence).toBeCloseTo(0.9);

    const batch = await prisma.generationBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch).toMatchObject({ status: 'completed', generatorModel: 'fake-generator' });
    expect(batch.promptVersion).toMatch(/^generator@.+\+verifier@.+$/);

    const skipped = await prisma.sourcePassage.findUniqueOrThrow({ where: { ref: 'Genesis 1:6-10' } });
    expect(skipped).toMatchObject({ status: 'skipped', lastError: 'skip: sem pergunta justa neste trecho' });
  });

  it('não grava a mesma pergunta duas vezes', async () => {
    await prisma.sourcePassage.update({ where: { ref: 'Genesis 1:1-5' }, data: { status: 'pending' } });
    const passages = await selectPassages(prisma, { titles: ['Genesis'], limit: 1 });
    const { stats } = await runSync(engine, prisma, passages, { concurrency: 1, locale: 'pt-BR' });
    expect(stats.questions.duplicates).toBe(2);
    expect(await prisma.question.count()).toBe(2);
  });

  it('envia e coleta um lote assíncrono', async () => {
    const passages = await selectPassages(prisma, { titles: ['Mishnah Berakhot'], limit: 3 });
    const { batchId } = await submitBatch(engine, prisma, passages);
    expect(await prisma.sourcePassage.count({ where: { status: 'in_batch', lastBatchId: batchId } })).toBe(3);

    const [result] = await collectBatches(engine, prisma, { concurrency: 2, locale: 'pt-BR' });
    expect(result).toMatchObject({ batchId, state: 'collected', stats: { passages: 3, skipped: 3 } });
    expect(await prisma.sourcePassage.count({ where: { status: 'in_batch' } })).toBe(0);
    expect(await prisma.generationBatch.findUniqueOrThrow({ where: { id: batchId } })).toMatchObject({ status: 'completed' });
  });

  it('gera o relatório de revisão com gabarito, fonte e motivo de reprovação', async () => {
    const md = await buildReviewReport(prisma, { limit: 10 });
    expect(md).toContain(lightQuestion().question);
    expect(md).toContain('✅ A luz');
    expect(md).toContain('https://www.sefaria.org/Genesis.1.3');
    expect(md).toContain('**Reprovada:**');
    expect(md).toContain('Tanach with Ta');
  });

  it('recalibra a dificuldade com dados de jogo', async () => {
    await prisma.question.updateMany({ where: { status: 'approved' }, data: { timesServed: 40, timesCorrect: 4 } });
    const { examined, changes } = await calibrate(prisma);
    expect(examined).toBe(1);
    expect(changes[0]).toMatchObject({ from: 'easy', to: 'medium' });
    const q = await prisma.question.findFirstOrThrow({ where: { status: 'approved' } });
    expect(q).toMatchObject({ difficulty: 'medium', aiDifficulty: 'easy' });
  });
});
