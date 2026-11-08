/**
 * Importa o banco (pipeline/bank/*.jsonl) para o PostgreSQL: cada pergunta vira uma linha
 * em Question (em português, origin = bank) e duas em QuestionTranslation (en e he, status
 * bank). Reimportar é seguro: a chave é o id da pergunta; o que mudou é atualizado, o que
 * saiu do banco é retirado de circulação (o histórico de jogadas fica).
 *
 * As perguntas dos geradores entram aprovadas, como as de molde do jogo: são montadas por
 * código a partir do texto e conferidas contra ele. As escritas à mão (kind = curated)
 * entram aguardando revisão humana, salvo com --approve.
 */
import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@trivia/db';
import { questionHash } from '../translate.js';
import type { BankQuestion } from './model.js';

export const BANK_PROVIDER = 'bank';
export const BANK_VERSION = 'bank-1';

export function bankDedupeKey(id: string): string {
  return createHash('sha256').update(`bank|${id}`).digest('hex');
}

export interface ImportStats {
  created: number;
  updated: number;
  unchanged: number;
  retired: number;
}

function questionData(q: BankQuestion) {
  const pt = q.i18n.pt;
  return {
    category: q.category,
    track: q.track,
    parashot: q.parashot,
    text: pt.text,
    options: pt.options,
    correctIndex: q.correctIndex,
    explanation: pt.explanation,
    sourceRef: q.sourceRef,
    evidenceQuote: pt.evidence.text,
    evidenceLanguage: pt.evidence.lang,
    contextLabel: pt.context?.label ?? null,
    contextText: pt.context?.text ?? null,
    contextLanguage: pt.context?.lang ?? null,
    versionTitle: pt.evidence.versionTitle,
    license: pt.evidence.license,
  };
}

export async function importBank(prisma: PrismaClient, questions: readonly BankQuestion[], opts: { approveCurated?: boolean; dryRun?: boolean } = {}): Promise<ImportStats> {
  const stats: ImportStats = { created: 0, updated: 0, unchanged: 0, retired: 0 };
  const keys = new Map(questions.map((q) => [bankDedupeKey(q.id), q]));
  const existing = new Map(
    (await prisma.question.findMany({ where: { origin: 'bank' }, select: { id: true, dedupeKey: true, status: true, text: true, options: true, explanation: true, evidenceQuote: true, contextLabel: true, contextText: true, correctIndex: true } })).map((r) => [r.dedupeKey, r]),
  );

  const list = [...keys.entries()];
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200);
    if (opts.dryRun) {
      for (const [key] of chunk) existing.has(key) ? stats.updated++ : stats.created++;
      continue;
    }
    await prisma.$transaction(
      async (tx) => {
        for (const [key, q] of chunk) {
          const data = questionData(q);
          const hash = questionHash({ ...data, options: [...data.options] });
          const row = existing.get(key);
          let questionId: string;
          if (!row) {
            const status = q.kind === 'curated' && !opts.approveCurated ? 'pending_review' : 'approved';
            const created = await tx.question.create({
              data: {
                ...data,
                origin: 'bank',
                locale: 'pt',
                aiDifficulty: q.difficulty,
                difficulty: q.difficulty,
                difficultyRationale: `Banco de perguntas: ${q.kind}.`,
                status,
                dedupeKey: key,
              } satisfies Prisma.QuestionUncheckedCreateInput,
            });
            questionId = created.id;
            stats.created++;
          } else {
            const same = questionHash({ ...row, options: row.options }) === hash && row.correctIndex === q.correctIndex;
            questionId = row.id;
            if (same) {
              stats.unchanged++;
            } else {
              // A dificuldade em uso fica (pode ter sido recalibrada); muda só o rótulo de origem.
              await tx.question.update({ where: { id: row.id }, data: { ...data, aiDifficulty: q.difficulty } });
              stats.updated++;
            }
          }
          for (const locale of ['en', 'he'] as const) {
            const loc = q.i18n[locale];
            const tr = {
              text: loc.text,
              options: loc.options,
              explanation: loc.explanation,
              evidenceQuote: loc.evidence.text,
              evidenceLanguage: loc.evidence.lang,
              versionTitle: loc.evidence.versionTitle,
              license: loc.evidence.license,
              contextLabel: loc.context?.label ?? null,
              contextText: loc.context?.text ?? null,
              contextLanguage: loc.context?.lang ?? null,
              sourceHash: hash,
              provider: BANK_PROVIDER,
              model: BANK_VERSION,
              promptVersion: BANK_VERSION,
              status: 'bank',
            };
            await tx.questionTranslation.upsert({ where: { questionId_locale: { questionId, locale } }, create: { questionId, locale, ...tr }, update: tr });
          }
        }
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  }

  // O que saiu do banco: fora de circulação (as jogadas antigas continuam apontando para ela).
  const gone = [...existing.entries()].filter(([key, r]) => !keys.has(key) && r.status === 'approved').map(([, r]) => r.id);
  if (gone.length && !opts.dryRun) await prisma.question.updateMany({ where: { id: { in: gone } }, data: { status: 'retired' } });
  stats.retired = gone.length;
  return stats;
}
