/**
 * "Pedras do Choshen" (Fase 11), o match-3 do Golem World.
 *
 * O app joga sozinho, com o mesmo motor determinístico de @trivia/shared: o servidor só
 * entrega a semente ao começar e, no fim, refaz a partida inteira a partir das jogadas.
 * Pontos, estrelas e moedas saem dessa reconstrução, nunca do que o app diz. Uma jogada
 * que não vale no tabuleiro refeito derruba a partida inteira.
 *
 * Moedas só pelas estrelas novas de cada fase (repetir a fase não rende de novo), e as
 * fases abrem em ordem.
 */
import { randomInt } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient, PuzzleRun as PuzzleRunRow } from '@trivia/db';
import {
  PUZZLE_LEVELS,
  PUZZLE_RULES,
  puzzleCoins,
  puzzleLevel,
  puzzleStars,
  replay,
  type PuzzleFinishResult,
  type PuzzleMove,
  type PuzzleOverview,
  type PuzzleRun,
} from '@trivia/shared';
import { Errors } from '../common/http.js';
import { CLOCK, PRISMA, type Clock } from '../common/infra.js';
import { WalletService, type Tx } from '../economy/wallet.service.js';

const HOUR = 3_600_000;

function runDto(row: PuzzleRunRow): PuzzleRun {
  return { id: row.id, level: row.level, seed: row.seed, extraMoves: row.extraMoves };
}

@Injectable()
export class PuzzleService {
  private readonly log = new Logger('Puzzle');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(WalletService) private readonly wallet: WalletService,
  ) {}

  private transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 20_000, maxWait: 10_000 });
  }

  /** Melhor resultado de cada fase já vencida e a maior fase aberta. */
  private async progress(db: Tx | PrismaClient, userId: string): Promise<{ best: Map<number, { stars: number; score: number }>; unlocked: number }> {
    const rows = await db.puzzleRun.groupBy({
      by: ['level'],
      where: { userId, status: 'won' },
      _max: { stars: true, score: true },
    });
    const best = new Map(rows.map((r) => [r.level, { stars: r._max.stars ?? 0, score: r._max.score ?? 0 }]));
    const highestWon = rows.reduce((m, r) => Math.max(m, r.level), 0);
    return { best, unlocked: Math.min(PUZZLE_LEVELS, highestWon + 1) };
  }

  async overview(userId: string): Promise<PuzzleOverview> {
    const { best, unlocked } = await this.progress(this.prisma, userId);
    const levels = [...best.entries()].sort(([a], [b]) => a - b).map(([level, b]) => ({ level, stars: b.stars, bestScore: b.score }));
    return { unlocked, levels, totalStars: levels.reduce((sum, l) => sum + l.stars, 0) };
  }

  /** Começa uma partida (uma por vez: a que estava aberta é deixada de lado). */
  async start(userId: string, level: number): Promise<PuzzleRun> {
    const now = this.clock.now();
    return this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const { unlocked } = await this.progress(tx, userId);
      if (level > unlocked) throw Errors.conflict('PUZZLE_LOCKED', 'Passe pelas fases anteriores para abrir esta.');
      await tx.puzzleRun.updateMany({ where: { userId, status: 'playing' }, data: { status: 'abandoned', endedAt: now } });
      const row = await tx.puzzleRun.create({ data: { userId, level, seed: randomInt(1, 2 ** 31 - 1), startedAt: now } });
      return runDto(row);
    });
  }

  /** Fim da partida: o servidor refaz tudo com as jogadas e grava o resultado. */
  async finish(userId: string, runId: string, moves: readonly PuzzleMove[]): Promise<PuzzleFinishResult> {
    const now = this.clock.now();
    const outcome = await this.transaction(async (tx) => {
      // A linha da partida fica travada: dois envios simultâneos não pagam duas vezes.
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "PuzzleRun" WHERE "id" = ${runId}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
      if (!locked) throw Errors.notFound('Partida não encontrada.');
      const run = await tx.puzzleRun.findUniqueOrThrow({ where: { id: runId } });
      if (run.status !== 'playing') throw Errors.conflict('PUZZLE_FINISHED', 'Esta partida já terminou.');
      if (now.getTime() - run.startedAt.getTime() > PUZZLE_RULES.runTtlHours * HOUR) {
        await tx.puzzleRun.update({ where: { id: run.id }, data: { status: 'abandoned', endedAt: now } });
        throw Errors.conflict('PUZZLE_EXPIRED', 'Esta partida ficou aberta tempo demais. Comece de novo.');
      }

      const level = puzzleLevel(run.level);
      const { state, invalidAt } = replay(level, run.seed, moves, run.extraMoves);
      if (invalidAt !== null) {
        this.log.warn(`partida ${run.id}: jogada ${invalidAt} não vale no tabuleiro refeito`);
        throw Errors.unprocessable('PUZZLE_INVALID', 'As jogadas não conferem com o tabuleiro desta partida.');
      }
      // Jogadas depois de passar de fase ou de acabar as jogadas não existem.
      if (moves.length > state.movesUsed) throw Errors.unprocessable('PUZZLE_INVALID', 'As jogadas não conferem com o tabuleiro desta partida.');

      const won = state.status === 'won';
      const status = won ? 'won' : state.status === 'lost' ? 'lost' : 'abandoned';
      const stars = puzzleStars(level, won, state.score);
      const previous = (await this.progress(tx, userId)).best.get(run.level)?.stars ?? 0;
      const coins = puzzleCoins(previous, stars);
      if (coins > 0) {
        await this.wallet.apply(tx, { userId, currency: 'coins', delta: coins, reason: 'puzzle', ref: run.id, idempotencyKey: `puzzle:${run.id}` });
      }
      await tx.puzzleRun.update({
        where: { id: run.id },
        data: { status, score: state.score, stars, movesUsed: state.movesUsed, coins, endedAt: now },
      });
      return { status, score: state.score, stars, bestStars: Math.max(previous, stars), coins } as const;
    });
    const { unlocked } = await this.progress(this.prisma, userId);
    return { ...outcome, unlocked, economy: await this.wallet.state(userId) };
  }
}
