/**
 * Recalibração da dificuldade com base no desempenho real dos jogadores.
 * Os contadores timesServed/timesCorrect são atualizados pela API a cada resposta.
 */
import type { PrismaClient } from '@trivia/db';
import { CALIBRATION_MIN_SAMPLES, recalibrateDifficulty, type Difficulty } from '@trivia/shared';

export interface CalibrationChange {
  id: string;
  sourceRef: string;
  from: Difficulty;
  to: Difficulty;
  smoothedAccuracy: number;
}

export async function calibrate(prisma: PrismaClient, { dryRun = false } = {}) {
  const questions = await prisma.question.findMany({
    where: { status: 'approved', timesServed: { gte: CALIBRATION_MIN_SAMPLES } },
    select: { id: true, sourceRef: true, difficulty: true, timesServed: true, timesCorrect: true },
  });
  const changes: CalibrationChange[] = [];
  const now = new Date();
  for (const q of questions) {
    const result = recalibrateDifficulty(q.difficulty, q);
    if (result.changed && result.smoothedAccuracy !== null) {
      changes.push({ id: q.id, sourceRef: q.sourceRef, from: q.difficulty, to: result.difficulty, smoothedAccuracy: result.smoothedAccuracy });
    }
    if (!dryRun) {
      await prisma.question.update({
        where: { id: q.id },
        data: { lastCalibratedAt: now, ...(result.changed ? { difficulty: result.difficulty } : {}) },
      });
    }
  }
  return { examined: questions.length, changes };
}
