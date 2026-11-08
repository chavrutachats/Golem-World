/**
 * Anúncios com prêmio e pausas com anúncio obrigatório.
 *
 * Um prêmio de anúncio passa por três passos:
 * 1. oferta: o servidor confere se o lugar vale agora (fase perdida, rodada da roleta,
 *    teto do dia…), fixa o prêmio e o devolve para o app MOSTRAR antes do anúncio;
 * 2. confirmação: o Google avisa o servidor que o anúncio foi visto até o fim (SSV),
 *    ou, só fora de produção, o próprio app avisa (anúncio de teste ou de demonstração);
 * 3. resgate: com a confirmação, o prêmio é entregue uma única vez.
 *
 * As pausas contam o ritmo do anúncio obrigatório (regras em @trivia/shared). Ver um
 * anúncio com prêmio por vontade própria também conta como anúncio visto.
 */
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AdPlacement as DbAdPlacement, PrismaClient, RewardTicket as RewardTicketRow } from '@trivia/db';
import {
  LIVES_RULES,
  PUZZLE_RULES,
  PrizeSchema,
  REWARD_RULES,
  livesAt,
  pacingAfterAd,
  prizeEffect,
  registerBreak,
  type AdBreakResult,
  type AdPlacement,
  type BoostKind,
  type Prize,
  type RewardClaimResult,
  type RewardTicket,
} from '@trivia/shared';
import { Errors } from '../common/http.js';
import { CLOCK, PRISMA, RANDOM, type Clock, type RandomSource } from '../common/infra.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { AdmobSsvVerifier, SsvError } from './admob-ssv.js';
import { boostPrize, giftPrize, wheelPrize } from './prizes.js';
import { WalletService, type Tx } from './wallet.service.js';

const MINUTE = 60_000;
const DAY_MS = 24 * 60 * MINUTE;

function ticketDto(row: RewardTicketRow, now: Date): RewardTicket {
  const status = row.claimedAt ? 'claimed' : row.watchedAt ? 'watched' : row.expiresAt <= now ? 'expired' : 'offered';
  return {
    id: row.id,
    placement: row.placement as AdPlacement,
    prize: PrizeSchema.parse(row.prize),
    status,
    expiresAt: row.expiresAt.toISOString(),
    ssvCustomData: row.id,
  };
}

@Injectable()
export class RewardsService {
  private readonly logger = new Logger('Rewards');
  private readonly ssv: AdmobSsvVerifier;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RANDOM) private readonly random: RandomSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(WalletService) private readonly wallet: WalletService,
  ) {
    this.ssv = new AdmobSsvVerifier(config.economy.admobKeysUrl);
  }

  private get key(): Buffer {
    return this.config.economy.rewardsKey;
  }

  private transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 20_000, maxWait: 10_000 });
  }

  private assertAdsOn(): void {
    if (this.config.economy.adsMode === 'off') throw Errors.conflict('ADS_OFF', 'Os anúncios com prêmio não estão disponíveis agora.');
  }

  /** As vidas do sevivon estão cheias? (Aí nenhum prêmio é uma vida, que se perderia.) */
  private async livesFull(db: Tx | PrismaClient, userId: string, now: Date): Promise<boolean> {
    const u = await db.user.findUnique({ where: { id: userId }, select: { lives: true, livesUpdatedAt: true } });
    return !!u && livesAt(u.lives, u.livesUpdatedAt, now).lives >= LIVES_RULES.max;
  }

  /** Prêmio da rodada (face do Prêmio no sevivon): fixo por turno (sem vida com as vidas cheias). */
  async roundPrize(userId: string, turnId: string, db: Tx | PrismaClient = this.prisma, now: Date = this.clock.now()): Promise<Prize | null> {
    if (this.config.economy.adsMode === 'off') return null;
    return wheelPrize(this.key, turnId, await this.livesFull(db, userId, now));
  }

  async roundPrizeClaimed(userId: string, turnId: string, db: Tx | PrismaClient = this.prisma): Promise<boolean> {
    const row = await db.rewardTicket.findUnique({
      where: { userId_placement_ref: { userId, placement: 'wheel', ref: turnId } },
      select: { claimedAt: true },
    });
    return !!row?.claimedAt;
  }

  /**
   * A face do Prêmio pode entrar no sorteio deste giro? Só uma vez por turno, com anúncios
   * ligados e abaixo do limite diário: cair nela nunca é um beco sem saída. Devolve o prêmio.
   */
  async wheelPrizeOpen(tx: Tx, userId: string, turnId: string, now: Date): Promise<Prize | null> {
    const prize = await this.roundPrize(userId, turnId, tx, now);
    if (!prize) return null;
    if ((await tx.spin.count({ where: { turnId, result: 'prize' } })) > 0) return null;
    const used = await tx.rewardTicket.count({ where: { userId, placement: 'wheel', watchedAt: { gte: new Date(now.getTime() - DAY_MS) } } });
    return used < REWARD_RULES.dailyCap.wheel ? prize : null;
  }

  // -------------------------------------------------------------------------
  // 1. Oferta
  // -------------------------------------------------------------------------

  async offer(userId: string, placement: AdPlacement, ref: string | undefined): Promise<RewardTicket> {
    this.assertAdsOn();
    if (placement === 'gift') throw Errors.unprocessable('REWARD_PLACEMENT', 'Este prêmio só aparece nas pausas do jogo.');
    const now = this.clock.now();
    return this.transaction(async (tx) => {
      await this.assertUnderDailyCap(tx, userId, placement, now);
      const { prize, ttlMs, keyedRef } = await this.eligibility(tx, userId, placement, ref, now);
      const expiresAt = new Date(now.getTime() + ttlMs);

      if (keyedRef) {
        // Uma oferta por lugar e referência (a fase, a rodada): pedir de novo devolve a mesma.
        const existing = await tx.rewardTicket.findUnique({ where: { userId_placement_ref: { userId, placement: placement as DbAdPlacement, ref: keyedRef } } });
        if (existing?.claimedAt) throw Errors.conflict('REWARD_ALREADY_CLAIMED', 'Este prêmio já foi resgatado.');
        if (existing) {
          const fresh = existing.watchedAt || existing.expiresAt > now ? existing : await tx.rewardTicket.update({ where: { id: existing.id }, data: { expiresAt, prize } });
          return ticketDto(fresh, now);
        }
        return ticketDto(await tx.rewardTicket.create({ data: { userId, placement: placement as DbAdPlacement, ref: keyedRef, prize, expiresAt } }), now);
      }
      // Sem referência (vida, ajuda): reaproveita a oferta aberta, para ninguém "sortear de novo" pedindo outra.
      const open = await tx.rewardTicket.findFirst({
        where: { userId, placement: placement as DbAdPlacement, watchedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
      });
      if (open) return ticketDto(open, now);
      const id = randomUUID();
      const finalPrize = placement === 'boost' ? boostPrize(this.key, userId, id) : prize;
      return ticketDto(await tx.rewardTicket.create({ data: { id, userId, placement: placement as DbAdPlacement, prize: finalPrize, expiresAt } }), now);
    });
  }

  private async assertUnderDailyCap(tx: Tx, userId: string, placement: AdPlacement, now: Date): Promise<void> {
    const used = await tx.rewardTicket.count({
      where: { userId, placement: placement as DbAdPlacement, watchedAt: { gte: new Date(now.getTime() - DAY_MS) } },
    });
    if (used >= REWARD_RULES.dailyCap[placement]) {
      throw Errors.conflict('REWARD_DAILY_LIMIT', 'Você já ganhou todos os prêmios deste tipo hoje. Volte amanhã!');
    }
  }

  /** O lugar vale agora? Devolve o prêmio, a validade e a referência que identifica a oferta. */
  private async eligibility(
    tx: Tx,
    userId: string,
    placement: AdPlacement,
    ref: string | undefined,
    now: Date,
  ): Promise<{ prize: Prize; ttlMs: number; keyedRef: string | null }> {
    const ttl = REWARD_RULES.offerTtlMinutes * MINUTE;
    const afterRun = REWARD_RULES.afterRunMinutes * MINUTE;
    const needRef = (): string => {
      if (!ref) throw Errors.unprocessable('REWARD_REF_REQUIRED', 'Falta dizer a que fase ou rodada o prêmio se refere.');
      return ref;
    };
    switch (placement) {
      case 'continue': {
        const run = await tx.journeyRun.findUnique({ where: { id: needRef() } });
        if (!run || run.userId !== userId) throw Errors.notFound('Fase não encontrada.');
        if (run.revivedAt) throw Errors.conflict('REWARD_ALREADY_CLAIMED', 'Este prêmio já foi resgatado.');
        if (run.status !== 'failed' || run.hearts > 0) throw Errors.conflict('REWARD_NOT_AVAILABLE', 'Este prêmio não está disponível agora.');
        if (!run.endedAt || now.getTime() - run.endedAt.getTime() > afterRun) throw Errors.conflict('REWARD_EXPIRED', 'O prazo deste prêmio acabou.');
        return { prize: { kind: 'heart' }, ttlMs: Math.min(ttl, afterRun), keyedRef: run.id };
      }
      case 'double': {
        const run = await tx.journeyRun.findUnique({ where: { id: needRef() } });
        if (!run || run.userId !== userId) throw Errors.notFound('Fase não encontrada.');
        if (run.status !== 'completed' || run.coins <= 0) throw Errors.conflict('REWARD_NOT_AVAILABLE', 'Este prêmio não está disponível agora.');
        if (!run.endedAt || now.getTime() - run.endedAt.getTime() > afterRun) throw Errors.conflict('REWARD_EXPIRED', 'O prazo deste prêmio acabou.');
        return { prize: { kind: 'double', amount: run.coins }, ttlMs: Math.min(ttl, afterRun), keyedRef: run.id };
      }
      case 'wheel': {
        const turn = await tx.turn.findUnique({ where: { id: needRef() }, include: { player: { select: { userId: true } } } });
        if (!turn || turn.player.userId !== userId) throw Errors.notFound('Rodada não encontrada.');
        if (turn.endedAt && now.getTime() - turn.endedAt.getTime() > afterRun) throw Errors.conflict('REWARD_EXPIRED', 'O prazo deste prêmio acabou.');
        // Fase 12: o prêmio da rodada só sai depois que o sevivon cai na face do Prêmio.
        if ((await tx.spin.count({ where: { turnId: turn.id, result: 'prize' } })) === 0) {
          throw Errors.conflict('REWARD_NOT_AVAILABLE', 'Este prêmio não está disponível agora.');
        }
        return { prize: wheelPrize(this.key, turn.id, await this.livesFull(tx, userId, now)), ttlMs: ttl, keyedRef: turn.id };
      }
      case 'life': {
        const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { lives: true, livesUpdatedAt: true } });
        if (livesAt(u.lives, u.livesUpdatedAt, now).lives >= LIVES_RULES.max) throw Errors.conflict('LIVES_FULL', 'Suas vidas já estão cheias.');
        return { prize: { kind: 'life', amount: 1 }, ttlMs: ttl, keyedRef: null };
      }
      case 'boost':
        // O tipo da ajuda é sorteado na criação (com o id da oferta).
        return { prize: { kind: 'boost', boost: 'time', amount: 1 }, ttlMs: ttl, keyedRef: null };
      case 'moves': {
        const run = await tx.puzzleRun.findUnique({ where: { id: needRef() } });
        if (!run || run.userId !== userId) throw Errors.notFound('Partida não encontrada.');
        if (run.extraMoves > 0) throw Errors.conflict('REWARD_ALREADY_CLAIMED', 'Este prêmio já foi resgatado.');
        if (run.status !== 'playing') throw Errors.conflict('REWARD_NOT_AVAILABLE', 'Este prêmio não está disponível agora.');
        return { prize: { kind: 'moves', amount: PUZZLE_RULES.extraMoves }, ttlMs: ttl, keyedRef: run.id };
      }
      case 'gift':
        throw Errors.unprocessable('REWARD_PLACEMENT', 'Este prêmio só aparece nas pausas do jogo.');
    }
  }

  // -------------------------------------------------------------------------
  // 2. Confirmação do anúncio
  // -------------------------------------------------------------------------

  /** O app avisa que o anúncio terminou. Só vale com anúncios de teste ou de demonstração. */
  async markWatchedByClient(userId: string, ticketId: string): Promise<RewardTicket> {
    const mode = this.config.economy.adsMode;
    if (mode !== 'demo' && mode !== 'trust-client') {
      throw Errors.forbidden('Este anúncio é confirmado pelo Google, não pelo aplicativo.');
    }
    const now = this.clock.now();
    return this.transaction(async (tx) => {
      const row = await tx.rewardTicket.findUnique({ where: { id: ticketId } });
      if (!row || row.userId !== userId) throw Errors.notFound('Prêmio não encontrado.');
      if (row.watchedAt) return ticketDto(row, now);
      if (row.expiresAt <= now) throw Errors.conflict('REWARD_EXPIRED', 'O prazo deste prêmio acabou.');
      const updated = await tx.rewardTicket.update({
        where: { id: ticketId },
        data: { watchedAt: now, adTransactionId: `${mode === 'demo' ? 'demo' : 'client'}:${ticketId}` },
      });
      await this.resetPacing(tx, userId, now);
      return ticketDto(updated, now);
    });
  }

  /**
   * Chamada do Google (SSV). Responde 200 sempre que a assinatura confere, mesmo para
   * oferta desconhecida ou repetida: o Google repete chamadas que falham, e repetir não
   * muda nada aqui.
   */
  async handleSsv(rawQuery: string): Promise<{ ok: boolean }> {
    if (this.config.economy.adsMode !== 'admob') throw Errors.notFound();
    let payload;
    try {
      payload = await this.ssv.verify(rawQuery);
    } catch (e) {
      if (e instanceof SsvError) {
        this.logger.warn(`SSV recusada: ${e.message}`);
        throw Errors.forbidden('Assinatura do anúncio inválida.');
      }
      throw e;
    }
    const now = this.clock.now();
    await this.transaction(async (tx) => {
      const row = /^[0-9a-f-]{36}$/i.test(payload.customData) ? await tx.rewardTicket.findUnique({ where: { id: payload.customData } }) : null;
      if (!row || row.userId !== payload.userId) {
        this.logger.warn(`SSV sem oferta correspondente (transaction ${payload.transactionId}).`);
        return;
      }
      if (row.watchedAt) return;
      const marked = await tx.rewardTicket.updateMany({
        where: { id: row.id, watchedAt: null },
        data: { watchedAt: now, adTransactionId: `admob:${payload.transactionId}` },
      });
      if (marked.count) await this.resetPacing(tx, row.userId, now);
    });
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // 3. Resgate
  // -------------------------------------------------------------------------

  async claim(userId: string, ticketId: string): Promise<RewardClaimResult> {
    const now = this.clock.now();
    const ticket = await this.transaction(async (tx) => {
      const row = await tx.rewardTicket.findUnique({ where: { id: ticketId } });
      if (!row || row.userId !== userId) throw Errors.notFound('Prêmio não encontrado.');
      if (row.claimedAt) return { row, status: 'claimed' as const };
      if (!row.watchedAt) {
        if (row.expiresAt <= now) throw Errors.conflict('REWARD_EXPIRED', 'O prazo deste prêmio acabou.');
        return { row, status: 'pending' as const };
      }
      // Marca o resgate com condição: dois toques simultâneos entregam uma vez só.
      const taken = await tx.rewardTicket.updateMany({ where: { id: row.id, claimedAt: null }, data: { claimedAt: now } });
      if (taken.count === 0) return { row: await tx.rewardTicket.findUniqueOrThrow({ where: { id: row.id } }), status: 'claimed' as const };
      await this.deliver(tx, row, PrizeSchema.parse(row.prize), now);
      return { row: await tx.rewardTicket.findUniqueOrThrow({ where: { id: row.id } }), status: 'claimed' as const };
    });
    return { status: ticket.status, ticket: ticketDto(ticket.row, now), economy: await this.wallet.state(userId) };
  }

  private async deliver(tx: Tx, row: RewardTicketRow, prize: Prize, now: Date): Promise<void> {
    const effect = prizeEffect(prize);
    const key = `reward:${row.id}`;
    if (effect.coins) await this.wallet.apply(tx, { userId: row.userId, currency: 'coins', delta: effect.coins, reason: 'reward', ref: row.ref ?? row.id, idempotencyKey: `${key}:coins` });
    if (effect.shekels) await this.wallet.apply(tx, { userId: row.userId, currency: 'shekels', delta: effect.shekels, reason: 'reward', ref: row.id, idempotencyKey: `${key}:shekels` });
    if (effect.lives) await this.wallet.gainLives(tx, row.userId, effect.lives, now);
    for (const [kind, amount] of Object.entries(effect.boosts)) {
      if (amount) await this.wallet.addBoost(tx, row.userId, kind as BoostKind, amount);
    }
    if (effect.revive) {
      // Volta à fase com 1 coração, do mesmo obstáculo em que parou.
      const revived = await tx.journeyRun.updateMany({
        where: { id: row.ref!, userId: row.userId, status: 'failed', revivedAt: null },
        data: { status: 'active', hearts: 1, endedAt: null, revivedAt: now },
      });
      if (revived.count === 0) throw Errors.conflict('REWARD_NOT_AVAILABLE', 'Este prêmio não está disponível agora.');
      // Uma fase por vez: outra que tenha começado nesse meio-tempo é encerrada.
      await tx.journeyRun.updateMany({ where: { userId: row.userId, status: 'active', id: { not: row.ref! } }, data: { status: 'abandoned', endedAt: now } });
    }
    if (effect.moves) {
      // Jogadas a mais na partida aberta do "Pedras do Choshen" (uma vez por partida).
      const granted = await tx.puzzleRun.updateMany({ where: { id: row.ref!, userId: row.userId, status: 'playing', extraMoves: 0 }, data: { extraMoves: effect.moves } });
      if (granted.count === 0) throw Errors.conflict('REWARD_NOT_AVAILABLE', 'Este prêmio não está disponível agora.');
    }
  }

  // -------------------------------------------------------------------------
  // Pausas e anúncio obrigatório
  // -------------------------------------------------------------------------

  private async resetPacing(tx: Tx, userId: string, now: Date): Promise<void> {
    const next = pacingAfterAd(now, (n) => this.random.int(n));
    await tx.user.update({ where: { id: userId }, data: { adBreaks: next.breaks, adBreakTarget: next.target, lastAdAt: now } });
  }

  async adBreak(userId: string): Promise<AdBreakResult> {
    if (this.config.economy.adsMode === 'off') return { action: 'none', gift: null };
    const now = this.clock.now();
    return this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { adFree: true, adBreaks: true, adBreakTarget: true, lastAdAt: true } });
      const { decision, breaks } = registerBreak({ breaks: u.adBreaks, target: u.adBreakTarget, lastAdAt: u.lastAdAt }, now, u.adFree);
      if (decision === 'none') {
        await tx.user.update({ where: { id: userId }, data: { adBreaks: Math.min(breaks, 100) } });
        return { action: 'none' as const, gift: null };
      }
      await this.resetPacing(tx, userId, now);
      // O presente vem antes: quem quiser vê a versão com prêmio; quem recusar vê o anúncio comum.
      const giftsToday = await tx.rewardTicket.count({ where: { userId, placement: 'gift', watchedAt: { gte: new Date(now.getTime() - DAY_MS) } } });
      if (giftsToday >= REWARD_RULES.dailyCap.gift) return { action: 'ad' as const, gift: null };
      const id = randomUUID();
      const row = await tx.rewardTicket.create({
        data: {
          id,
          userId,
          placement: 'gift',
          ref: id,
          prize: giftPrize(this.key, userId, id, await this.livesFull(tx, userId, now)),
          expiresAt: new Date(now.getTime() + REWARD_RULES.offerTtlMinutes * MINUTE),
        },
      });
      return { action: 'ad' as const, gift: ticketDto(row, now) };
    });
  }
}

