/**
 * Orquestração da geração sobre o banco:
 *  - `runSync`: chama o gerador passagem a passagem (com concorrência) e grava na hora;
 *  - `submitBatch` + `collectBatches`: envia o lote à Batch API do provedor e coleta depois.
 * Nos dois modos o verificador roda de forma síncrona (são chamadas curtas).
 */
import type { PrismaClient, PassageStatus, Prisma } from '@trivia/db';
import type { CategoryId } from '@trivia/shared';
import { log, mapWithConcurrency } from '../util.js';
import { buildGeneratorRequest, generateForPassage, processGeneratorText, type Engine } from './engine.js';
import { emptyStats, persistOutcome, toPassageInput, type BatchStats } from './persist.js';

export interface PassageFilter {
  categories?: CategoryId[];
  titles?: string[];
  /** Faixa de seções (capítulo/daf), pelo número: { from: 1, to: 11 }. */
  sections?: { from: number; to: number };
  limit: number;
  /** Também reprocessa passagens que falharam antes. */
  retryFailed?: boolean;
}

export async function selectPassages(prisma: PrismaClient, filter: PassageFilter) {
  const statuses: PassageStatus[] = filter.retryFailed ? ['pending', 'failed'] : ['pending'];
  const where: Prisma.SourcePassageWhereInput = {
    status: { in: statuses },
    ...(filter.categories?.length ? { category: { in: filter.categories } } : {}),
    ...(filter.titles?.length ? { bookTitle: { in: filter.titles, mode: 'insensitive' } } : {}),
  };
  const rows = await prisma.sourcePassage.findMany({
    where,
    orderBy: [{ bookTitle: 'asc' }, { sequence: 'asc' }],
    // Com filtro de seção, buscamos mais e filtramos em memória (seção pode ser "2a").
    ...(filter.sections ? {} : { take: filter.limit }),
  });
  const filtered = filter.sections
    ? rows.filter((r) => {
        const n = parseInt(r.section, 10);
        return n >= filter.sections!.from && n <= filter.sections!.to;
      })
    : rows;
  return filtered.slice(0, filter.limit);
}

export interface RunInfo {
  provider: string;
  generatorModel: string;
  verifierModel: string;
  promptVersion: string;
}

export function runInfo(engine: Engine): RunInfo {
  return {
    provider: engine.generator.name,
    generatorModel: engine.generator.model,
    verifierModel: engine.verifier.model,
    promptVersion: `generator@${engine.generatorPrompt.version}+verifier@${engine.verifierPrompt.version}`,
  };
}

export async function runSync(
  engine: Engine,
  prisma: PrismaClient,
  passages: Awaited<ReturnType<typeof selectPassages>>,
  options: { concurrency: number; locale: string },
): Promise<{ batchId: string; stats: BatchStats }> {
  const info = runInfo(engine);
  const batch = await prisma.generationBatch.create({
    data: { ...info, status: 'running' },
  });
  const stats = emptyStats();
  let done = 0;
  await mapWithConcurrency(passages, options.concurrency, async (row) => {
    const passage = toPassageInput(row);
    const outcome = await generateForPassage(engine, passage);
    await persistOutcome(prisma, passage, outcome, batch.id, options.locale, stats);
    done++;
    const summary =
      outcome.passageStatus === 'generated'
        ? outcome.candidates.map((c) => c.status).join(', ')
        : outcome.passageStatus === 'skipped'
          ? `pulada: ${outcome.skipReason}`
          : `falhou: ${outcome.error}`;
    log.info(`[${done}/${passages.length}] ${passage.ref} → ${summary}`);
  });
  await prisma.generationBatch.update({
    where: { id: batch.id },
    data: { status: 'completed', completedAt: new Date(), stats: stats as unknown as Prisma.InputJsonValue },
  });
  return { batchId: batch.id, stats };
}

/** custom_id da Batch API: o UUID da passagem sem hífens (32 caracteres). */
export function toCustomId(passageId: string): string {
  return passageId.replace(/-/g, '');
}

export function fromCustomId(customId: string): string {
  const h = customId;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function submitBatch(
  engine: Engine,
  prisma: PrismaClient,
  passages: Awaited<ReturnType<typeof selectPassages>>,
): Promise<{ batchId: string; providerBatchId: string }> {
  const capability = engine.generator.batch;
  if (!capability) throw new Error(`O provedor "${engine.generator.name}" não suporta Batch API; rode sem --batch.`);
  const requests = passages.map((row) => ({
    customId: toCustomId(row.id),
    request: buildGeneratorRequest(engine, toPassageInput(row)),
  }));
  const { batchId: providerBatchId } = await capability.submit(requests);
  const batch = await prisma.generationBatch.create({
    data: { ...runInfo(engine), status: 'running', providerBatchId },
  });
  await prisma.sourcePassage.updateMany({
    where: { id: { in: passages.map((p) => p.id) } },
    data: { status: 'in_batch', lastBatchId: batch.id },
  });
  return { batchId: batch.id, providerBatchId };
}

export interface CollectResult {
  batchId: string;
  providerBatchId: string;
  state: 'still_running' | 'collected';
  counts?: Record<string, number>;
  stats?: BatchStats;
}

/** Coleta lotes enviados que já terminaram no provedor (todos, ou só o indicado). */
export async function collectBatches(
  engine: Engine,
  prisma: PrismaClient,
  options: { batchId?: string; concurrency: number; locale: string },
): Promise<CollectResult[]> {
  const capability = engine.generator.batch;
  if (!capability) throw new Error(`O provedor "${engine.generator.name}" não suporta Batch API.`);
  const batches = await prisma.generationBatch.findMany({
    where: {
      status: 'running',
      providerBatchId: { not: null },
      ...(options.batchId ? { id: options.batchId } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });
  const results: CollectResult[] = [];

  for (const batch of batches) {
    const providerBatchId = batch.providerBatchId!;
    const status = await capability.status(providerBatchId);
    if (!status.ended) {
      results.push({
        batchId: batch.id,
        providerBatchId,
        state: 'still_running',
        ...(status.counts ? { counts: status.counts } : {}),
      });
      continue;
    }

    const items: { passageId: string; text?: string; usage?: { inputTokens: number; outputTokens: number }; error?: string }[] = [];
    for await (const item of capability.results(providerBatchId)) {
      const passageId = fromCustomId(item.customId);
      items.push(
        item.ok
          ? { passageId, text: item.response.text, ...(item.response.usage ? { usage: item.response.usage } : {}) }
          : { passageId, error: item.error },
      );
    }

    const rows = await prisma.sourcePassage.findMany({ where: { id: { in: items.map((i) => i.passageId) } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const stats = emptyStats();
    await mapWithConcurrency(items, options.concurrency, async (item) => {
      const row = byId.get(item.passageId);
      if (!row) return;
      const passage = toPassageInput(row);
      const outcome =
        item.text !== undefined
          ? await processGeneratorText(engine, passage, item.text, item.usage)
          : { passageStatus: 'failed' as const, error: item.error ?? 'erro desconhecido', candidates: [], usage: { inputTokens: 0, outputTokens: 0 } };
      await persistOutcome(prisma, passage, outcome, batch.id, options.locale, stats);
    });

    // Passagens do lote que não voltaram nos resultados ficam disponíveis de novo.
    await prisma.sourcePassage.updateMany({
      where: { lastBatchId: batch.id, status: 'in_batch' },
      data: { status: 'failed', lastError: 'sem resultado no lote' },
    });
    await prisma.generationBatch.update({
      where: { id: batch.id },
      data: { status: 'completed', completedAt: new Date(), stats: stats as unknown as Prisma.InputJsonValue },
    });
    results.push({ batchId: batch.id, providerBatchId, state: 'collected', stats });
  }
  return results;
}
