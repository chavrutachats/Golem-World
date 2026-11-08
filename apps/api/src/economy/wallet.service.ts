/**
 * Carteira do jogador: moedas de sabedoria, shekels, ajudas da mochila e vidas da
 * roleta. Toda mudança de saldo passa por aqui, dentro da transação de quem chama:
 *
 * - o desconto só acontece se houver saldo (condição na própria atualização, sem
 *   corrida entre dois toques), e o banco ainda recusa saldo negativo (CHECK);
 * - cada mudança vira uma linha do extrato (WalletEntry) com o saldo depois;
 * - com chave de idempotência, a mesma entrega (compra reenviada, prêmio repetido)
 *   não acontece duas vezes.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { BoostKind as DbBoostKind, Prisma, PrismaClient } from '@trivia/db';
import {
  AD_PLACEMENTS,
  BOOST_RULES,
  BOOSTS,
  LIVES_RULES,
  REWARD_RULES,
  gainLives,
  livesAt,
  type AdPlacement,
  type BoostCounts,
  type BoostKind,
  type Currency,
  type EconomyState,
} from '@trivia/shared';
import { Errors } from '../common/http.js';
import { CLOCK, PRISMA, type Clock } from '../common/infra.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

export type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

/** Por que o saldo mudou (vai no extrato). */
export type WalletReason = 'journey' | 'completion' | 'shop' | 'offer' | 'purchase' | 'reward' | 'puzzle';

export interface WalletChange {
  userId: string;
  currency: Currency;
  /** Positivo credita, negativo debita. */
  delta: number;
  reason: WalletReason;
  ref?: string | null;
  /** Mesma chave = mesma entrega: a segunda vez não muda nada. */
  idempotencyKey?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class WalletService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Credita ou debita, registrando no extrato. Debitar sem saldo é um erro 409. */
  async apply(tx: Tx, change: WalletChange): Promise<{ balance: number; duplicate: boolean }> {
    const { userId, currency, delta } = change;
    if (!Number.isInteger(delta) || delta === 0) throw new Error(`Mudança de saldo inválida: ${delta}`);
    if (change.idempotencyKey) {
      const previous = await tx.walletEntry.findUnique({ where: { idempotencyKey: change.idempotencyKey } });
      if (previous) return { balance: previous.balance, duplicate: true };
    }
    // Duas consultas explícitas (em vez de montar o nome da coluna): nada de SQL dinâmico.
    const rows =
      currency === 'coins'
        ? await tx.$queryRaw<{ balance: number }[]>`
            UPDATE "User" SET "coins" = "coins" + ${delta}
            WHERE "id" = ${userId}::uuid AND "coins" + ${delta} >= 0 RETURNING "coins" AS "balance"`
        : await tx.$queryRaw<{ balance: number }[]>`
            UPDATE "User" SET "shekels" = "shekels" + ${delta}
            WHERE "id" = ${userId}::uuid AND "shekels" + ${delta} >= 0 RETURNING "shekels" AS "balance"`;
    const balance = rows[0]?.balance;
    if (balance === undefined) {
      throw currency === 'coins'
        ? Errors.conflict('NOT_ENOUGH_COINS', 'Moedas insuficientes. Jogue mais fases do Golem World!')
        : Errors.conflict('NOT_ENOUGH_SHEKELS', 'Shekels insuficientes.');
    }
    await tx.walletEntry.create({
      data: { userId, currency, delta, balance, reason: change.reason, ref: change.ref ?? null, idempotencyKey: change.idempotencyKey ?? null },
    });
    return { balance, duplicate: false };
  }

  // -------------------------------------------------------------------------
  // Ajudas da mochila
  // -------------------------------------------------------------------------

  async boosts(db: Db, userId: string): Promise<BoostCounts> {
    const rows = await db.userBoost.findMany({ where: { userId }, select: { kind: true, count: true } });
    const out = Object.fromEntries(BOOSTS.map((b) => [b, 0])) as BoostCounts;
    for (const r of rows) out[r.kind as BoostKind] = r.count;
    return out;
  }

  /** Quantas cabem ainda na mochila (para recusar a compra antes de cobrar). */
  async boostRoom(db: Db, userId: string, kind: BoostKind): Promise<number> {
    const row = await db.userBoost.findUnique({ where: { userId_kind: { userId, kind: kind as DbBoostKind } } });
    return BOOST_RULES.maxPerKind - (row?.count ?? 0);
  }

  async addBoost(tx: Tx, userId: string, kind: BoostKind, amount: number): Promise<number> {
    const rows = await tx.$queryRaw<{ count: number }[]>`
      INSERT INTO "UserBoost" ("userId", "kind", "count") VALUES (${userId}::uuid, ${kind}::"BoostKind", LEAST(${amount}::int, ${BOOST_RULES.maxPerKind}::int)::smallint)
      ON CONFLICT ("userId", "kind") DO UPDATE SET "count" = LEAST("UserBoost"."count" + EXCLUDED."count", ${BOOST_RULES.maxPerKind}::int)::smallint
      RETURNING "count"`;
    return rows[0]!.count;
  }

  /** Gasta uma ajuda, se houver. */
  async consumeBoost(tx: Tx, userId: string, kind: BoostKind): Promise<boolean> {
    const used = await tx.userBoost.updateMany({
      where: { userId, kind: kind as DbBoostKind, count: { gt: 0 } },
      data: { count: { decrement: 1 } },
    });
    return used.count > 0;
  }

  // -------------------------------------------------------------------------
  // Vidas da roleta
  // -------------------------------------------------------------------------

  /** Soma vidas (anúncio ou recarga), com o usuário travado para não perder recarga em corrida. */
  async gainLives(tx: Tx, userId: string, amount: number, now: Date): Promise<number> {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { lives: true, livesUpdatedAt: true } });
    const next = gainLives(u.lives, u.livesUpdatedAt, now, amount);
    await tx.user.update({ where: { id: userId }, data: { lives: next.lives, livesUpdatedAt: next.updatedAt } });
    return next.lives;
  }

  // -------------------------------------------------------------------------
  // Estado para o app
  // -------------------------------------------------------------------------

  /** Anúncios com prêmio vistos nas últimas 24 horas, por lugar. */
  async rewardsToday(db: Db, userId: string, now: Date): Promise<Record<AdPlacement, number>> {
    const rows = await db.rewardTicket.groupBy({
      by: ['placement'],
      where: { userId, watchedAt: { gte: new Date(now.getTime() - DAY_MS) } },
      _count: { _all: true },
    });
    const out = Object.fromEntries(AD_PLACEMENTS.map((p) => [p, 0])) as Record<AdPlacement, number>;
    for (const r of rows) out[r.placement as AdPlacement] = r._count._all;
    return out;
  }

  async state(userId: string, db: Db = this.prisma): Promise<EconomyState> {
    const now = this.clock.now();
    const [user, boosts, used] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true, shekels: true, adFree: true, lives: true, livesUpdatedAt: true } }),
      this.boosts(db, userId),
      this.rewardsToday(db, userId, now),
    ]);
    const lives = livesAt(user.lives, user.livesUpdatedAt, now);
    return {
      wallet: { coins: user.coins, shekels: user.shekels },
      adFree: user.adFree,
      boosts,
      lives: { lives: lives.lives, max: LIVES_RULES.max, nextLifeAt: lives.nextLifeAt?.toISOString() ?? null },
      ads: { mode: this.config.economy.adsMode },
      store: { mode: this.config.economy.storeMode },
      rewardsToday: Object.fromEntries(
        AD_PLACEMENTS.map((p) => [p, { used: used[p], cap: REWARD_RULES.dailyCap[p] }]),
      ) as EconomyState['rewardsToday'],
    };
  }
}
