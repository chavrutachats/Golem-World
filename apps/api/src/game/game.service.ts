/**
 * Orquestração da partida sobre o banco. As regras em si estão em rules.ts (funções
 * puras); aqui ficam carga e gravação do estado, turnos, giros, perguntas servidas,
 * prazos e o controle de concorrência.
 *
 * Toda ação que muda a partida roda numa transação que trava a linha do jogo
 * (SELECT … FOR UPDATE), então dois toques rápidos no app, ou os dois jogadores ao
 * mesmo tempo, nunca corrompem o estado.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@trivia/db';
import {
  GAME_RULES,
  LIVES_RULES,
  OPTION_COUNT,
  PRIZE_SLICE,
  isCategoryId,
  livesAt,
  lookFromItems,
  spendLife,
  type Lives,
  renderDivineNamesForDisplay,
  sefariaUrlForRef,
  type AnswerResult,
  type CategoryId,
  type GameMode,
  type GameState,
  type GameSummary,
  type PlayerState,
  type QuestionForPlayer,
  type SourceLanguage,
  type SpinResponse,
  localeFromTag,
  type Locale,
} from '@trivia/shared';
import { Errors } from '../common/http.js';
import { CLOCK, PRISMA, RANDOM, type Clock, type RandomSource } from '../common/infra.js';
import { RewardsService } from '../economy/rewards.service.js';
import { localizeQuestion, type LocalizedQuestion } from '../questions/localized.js';
import { optionsDirection } from '../questions/question-factory.service.js';
import { QuestionSelector } from './question-selector.service.js';
import {
  applyAnswer,
  applySpin,
  computePhase,
  crownChoices,
  drawSlice,
  forfeit as forfeitRule,
  isCrownFull,
  isPlayExpired,
  shuffleOptions,
  sliceIndexOf,
  sliceNeedsQuestion,
  type GameSnapshot,
} from './rules.js';

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;

/** Por quanto tempo um código de convite pode ser usado. */
export const INVITE_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;

const TURN_TIMEOUT_MS = GAME_RULES.turnTimeoutHours * 3600 * 1000;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const GAME_INCLUDE = {
  players: {
    orderBy: { seat: 'asc' },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          isBot: true,
          items: { where: { equipped: true }, select: { itemId: true, equipped: true } },
        },
      },
    },
  },
} satisfies Prisma.GameInclude;
type LoadedGame = Prisma.GameGetPayload<{ include: typeof GAME_INCLUDE }>;
type LoadedPlayer = LoadedGame['players'][number];

const PLAY_INCLUDE = {
  question: {
    include: {
      studyText: { select: { id: true } },
      passage: {
        select: {
          heVersionTitle: true,
          heLicense: true,
          enVersionTitle: true,
          enLicense: true,
          ptVersionTitle: true,
          ptLicense: true,
        },
      },
    },
  },
} satisfies Prisma.QuestionPlayInclude;
type LoadedPlay = Prisma.QuestionPlayGetPayload<{ include: typeof PLAY_INCLUDE }>;

const TURN_INCLUDE = {
  spins: { where: { consumedAt: null }, orderBy: { createdAt: 'desc' } },
  plays: { where: { answeredAt: null }, include: PLAY_INCLUDE },
} satisfies Prisma.TurnInclude;
type LoadedTurn = Prisma.TurnGetPayload<{ include: typeof TURN_INCLUDE }>;

interface Context {
  game: LoadedGame;
  me: LoadedPlayer;
  isMyTurn: boolean;
  turn: LoadedTurn | null;
}

function snapshotOf(game: LoadedGame): GameSnapshot {
  return {
    mode: game.mode,
    status: game.status,
    roundNumber: game.roundNumber,
    maxRounds: game.maxRounds,
    currentSeat: game.players.find((p) => p.id === game.currentPlayerId)?.seat ?? null,
    winnerSeat: game.players.find((p) => p.id === game.winnerPlayerId)?.seat ?? null,
    players: game.players.map((p) => ({
      seat: p.seat,
      seals: [...p.seals],
      crownProgress: p.crownProgress,
      score: p.score,
      correctCount: p.correctCount,
      wrongCount: p.wrongCount,
    })),
  };
}

function playerState(p: LoadedPlayer): PlayerState {
  return {
    userId: p.userId,
    displayName: p.user.displayName,
    isBot: p.user.isBot,
    golem: lookFromItems(p.user.items),
    seals: [...p.seals],
    crownProgress: p.crownProgress,
    score: p.score,
    correctCount: p.correctCount,
    wrongCount: p.wrongCount,
  };
}

function questionForPlayer(play: LoadedPlay, local: LocalizedQuestion, now: Date): QuestionForPlayer {
  const options = play.optionOrder.map((i) => local.options[i]!);
  return {
    playId: play.id,
    category: play.category,
    difficulty: play.difficulty,
    isCrownChallenge: play.source === 'crown_challenge',
    text: local.text,
    context: local.context,
    options,
    optionsDirection: optionsDirection(options),
    servedAt: play.servedAt.toISOString(),
    deadlineAt: play.deadlineAt.toISOString(),
    serverNow: now.toISOString(),
    timeLimitSeconds: GAME_RULES.questionTimeLimitSeconds,
  };
}

function livesDto(state: { lives: number; nextLifeAt: Date | null }): Lives {
  return { lives: state.lives, max: LIVES_RULES.max, nextLifeAt: state.nextLifeAt?.toISOString() ?? null };
}

@Injectable()
export class GameService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RANDOM) private readonly random: RandomSource,
    @Inject(QuestionSelector) private readonly selector: QuestionSelector,
    @Inject(RewardsService) private readonly rewards: RewardsService,
  ) {}

  private async localeOf(db: Db, userId: string): Promise<Locale> {
    const u = await db.user.findUnique({ where: { id: userId }, select: { locale: true } });
    return localeFromTag(u?.locale);
  }

  // -------------------------------------------------------------------------
  // Infra interna
  // -------------------------------------------------------------------------

  private transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 15_000, maxWait: 10_000 });
  }

  private async lock(tx: Tx, gameId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${gameId}::uuid FOR UPDATE`;
  }

  private async load(db: Db, gameId: string, userId: string): Promise<{ game: LoadedGame; me: LoadedPlayer }> {
    const game = await db.game.findUnique({ where: { id: gameId }, include: GAME_INCLUDE });
    const me = game?.players.find((p) => p.userId === userId);
    if (!game || !me) throw Errors.notFound('Partida não encontrada.');
    return { game, me };
  }

  private currentTurn(db: Db, gameId: string): Promise<LoadedTurn | null> {
    return db.turn.findFirst({
      where: { gameId, endedAt: null },
      orderBy: { startedAt: 'desc' },
      include: TURN_INCLUDE,
    });
  }

  private async context(db: Db, gameId: string, userId: string): Promise<Context> {
    const { game, me } = await this.load(db, gameId, userId);
    const isMyTurn = game.status === 'active' && game.currentPlayerId === me.id;
    const turn = isMyTurn ? await this.currentTurn(db, gameId) : null;
    return { game, me, isMyTurn, turn };
  }

  private phaseOf(ctx: Context) {
    const pendingSpin = ctx.turn?.spins.find((s) => isCategoryId(s.result)) ?? null;
    const pendingPlay = ctx.turn?.plays[0] ?? null;
    return {
      pendingSpin,
      pendingPlay,
      phase: computePhase({
        status: ctx.game.status,
        isMyTurn: ctx.isMyTurn,
        crownFull: isCrownFull(ctx.me),
        hasPendingSpin: !!pendingSpin,
        hasPendingPlay: !!pendingPlay,
      }),
    };
  }

  private assertMyTurn(ctx: Context): void {
    if (ctx.game.status !== 'active') throw Errors.conflict('GAME_NOT_ACTIVE', 'A partida não está em andamento.');
    if (!ctx.isMyTurn) throw Errors.conflict('NOT_YOUR_TURN', 'Não é a sua vez.');
  }

  private assertPhase(ctx: Context, expected: string): void {
    const { phase } = this.phaseOf(ctx);
    if (phase !== expected) {
      throw Errors.conflict('WRONG_PHASE', 'Esta ação não está disponível agora (fase atual: {phase}).', { phase });
    }
  }

  private async saveSnapshot(tx: Tx, game: LoadedGame, snap: GameSnapshot, now: Date): Promise<void> {
    const idBySeat = new Map(game.players.map((p) => [p.seat, p.id]));
    const active = snap.status === 'active';
    await tx.game.update({
      where: { id: game.id },
      data: {
        status: snap.status,
        roundNumber: Math.min(snap.roundNumber, snap.maxRounds),
        currentPlayerId: snap.currentSeat === null ? null : idBySeat.get(snap.currentSeat)!,
        winnerPlayerId: snap.winnerSeat === null ? null : idBySeat.get(snap.winnerSeat)!,
        finishedAt: active ? null : (game.finishedAt ?? now),
        turnDeadlineAt: active && game.mode !== 'solo' ? new Date(now.getTime() + TURN_TIMEOUT_MS) : null,
      },
    });
    for (const p of snap.players) {
      const before = game.players.find((x) => x.seat === p.seat)!;
      const changed =
        before.crownProgress !== p.crownProgress ||
        before.score !== p.score ||
        before.correctCount !== p.correctCount ||
        before.wrongCount !== p.wrongCount ||
        before.seals.length !== p.seals.length;
      if (changed) {
        await tx.gamePlayer.update({
          where: { id: before.id },
          data: {
            seals: p.seals,
            crownProgress: p.crownProgress,
            score: p.score,
            correctCount: p.correctCount,
            wrongCount: p.wrongCount,
          },
        });
      }
    }
  }

  private async startTurn(tx: Tx, game: LoadedGame, seat: number, roundNumber: number, now: Date): Promise<void> {
    const player = game.players.find((p) => p.seat === seat)!;
    await tx.turn.create({ data: { gameId: game.id, playerId: player.id, roundNumber, startedAt: now } });
  }

  private async endTurn(tx: Tx, gameId: string, now: Date): Promise<void> {
    await tx.turn.updateMany({ where: { gameId, endedAt: null }, data: { endedAt: now } });
  }

  /**
   * Aplica prazos vencidos antes de qualquer ação: W.O. por 48 h sem jogar e pergunta
   * aberta além do tempo (conta como erro). `skipPlayId` evita resolver duas vezes a
   * pergunta que está sendo respondida agora.
   */
  private async applyDeadlines(tx: Tx, gameId: string, userId: string, now: Date, skipPlayId?: string): Promise<void> {
    const { game } = await this.load(tx, gameId, userId);
    if (game.status !== 'active') return;
    if (game.mode !== 'solo' && game.turnDeadlineAt && game.turnDeadlineAt <= now) {
      const loser = game.players.find((p) => p.id === game.currentPlayerId);
      if (loser) {
        await this.saveSnapshot(tx, game, forfeitRule(snapshotOf(game), loser.seat), now);
        await this.endTurn(tx, game.id, now);
        return;
      }
    }
    const turn = await this.currentTurn(tx, gameId);
    const play = turn?.plays[0];
    if (play && play.id !== skipPlayId && isPlayExpired(play.deadlineAt, now)) {
      await this.resolvePlay(tx, game, play, null, now);
    }
  }

  /** Vidas do jogador agora (com a recarga aplicada). Bots têm vidas infinitas. */
  async livesOf(db: Db, userId: string, now: Date): Promise<{ lives: number; nextLifeAt: Date | null; isBot: boolean }> {
    const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { lives: true, livesUpdatedAt: true, isBot: true } });
    if (u.isBot) return { lives: LIVES_RULES.max, nextLifeAt: null, isBot: true };
    return { ...livesAt(u.lives, u.livesUpdatedAt, now), isBot: false };
  }

  private async loseLife(tx: Tx, userId: string, now: Date): Promise<{ lives: number; nextLifeAt: Date | null }> {
    const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { lives: true, livesUpdatedAt: true, isBot: true } });
    if (u.isBot) return { lives: LIVES_RULES.max, nextLifeAt: null };
    const next = spendLife(u.lives, u.livesUpdatedAt, now);
    await tx.user.update({ where: { id: userId }, data: { lives: next.lives, livesUpdatedAt: next.updatedAt } });
    return next;
  }

  // -------------------------------------------------------------------------
  // Criação e consulta
  // -------------------------------------------------------------------------

  private async newInviteCode(tx: Tx): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = Array.from({ length: 6 }, () => INVITE_ALPHABET[this.random.int(INVITE_ALPHABET.length)]).join('');
      if (!(await tx.game.findUnique({ where: { inviteCode: code } }))) return code;
    }
    throw new Error('Não foi possível gerar um código de convite único.');
  }

  private async activate(tx: Tx, gameId: string, now: Date, solo: boolean): Promise<void> {
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: GAME_INCLUDE });
    const first = game.players[0]!;
    await tx.game.update({
      where: { id: gameId },
      data: {
        status: 'active',
        currentPlayerId: first.id,
        turnDeadlineAt: solo ? null : new Date(now.getTime() + TURN_TIMEOUT_MS),
      },
    });
    await tx.turn.create({ data: { gameId, playerId: first.id, roundNumber: 1, startedAt: now } });
  }

  async create(userId: string, input: { mode: GameMode; inviteCode?: string | undefined }): Promise<GameState> {
    const now = this.clock.now();
    const gameId = await this.transaction(async (tx) => {
      if (input.mode === 'solo') {
        const game = await tx.game.create({
          data: { mode: 'solo', status: 'waiting_opponent', maxRounds: GAME_RULES.maxRounds, createdAt: now, players: { create: { userId, seat: 0 } } },
        });
        await this.activate(tx, game.id, now, true);
        return game.id;
      }

      if (input.mode === 'friend' && input.inviteCode) {
        const game = await tx.game.findUnique({ where: { inviteCode: input.inviteCode.toUpperCase() }, include: GAME_INCLUDE });
        if (!game || game.mode !== 'friend') throw Errors.conflict('INVITE_NOT_FOUND', 'Código de convite não encontrado.');
        if (game.players.some((p) => p.userId === userId)) {
          if (game.status === 'waiting_opponent') throw Errors.conflict('OWN_GAME', 'Este é o seu próprio convite: compartilhe o código com um amigo.');
          return game.id;
        }
        await this.lock(tx, game.id);
        const fresh = await tx.game.findUniqueOrThrow({ where: { id: game.id } });
        if (fresh.status !== 'waiting_opponent') throw Errors.conflict('INVITE_USED', 'Este convite já foi usado.');
        // Convite vale 7 dias (a limpeza periódica também fecha, mas não dependemos dela).
        if (now.getTime() - fresh.createdAt.getTime() > INVITE_VALIDITY_MS) {
          throw Errors.conflict('INVITE_EXPIRED', 'Este convite venceu. Peça um código novo ao seu amigo.');
        }
        await tx.gamePlayer.create({ data: { gameId: game.id, userId, seat: 1 } });
        await this.activate(tx, game.id, now, false);
        return game.id;
      }

      if (input.mode === 'random') {
        const mine = await tx.game.findFirst({
          where: { mode: 'random', status: 'waiting_opponent', players: { some: { userId } } },
        });
        if (mine) return mine.id;
        const [open] = await tx.$queryRaw<{ id: string }[]>`
          SELECT g.id FROM "Game" g
          WHERE g.mode = 'random' AND g.status = 'waiting_opponent'
            AND NOT EXISTS (SELECT 1 FROM "GamePlayer" gp WHERE gp."gameId" = g.id AND gp."userId" = ${userId}::uuid)
          ORDER BY g."createdAt" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED`;
        if (open) {
          await tx.gamePlayer.create({ data: { gameId: open.id, userId, seat: 1 } });
          await this.activate(tx, open.id, now, false);
          return open.id;
        }
      }

      const game = await tx.game.create({
        data: {
          mode: input.mode,
          status: 'waiting_opponent',
          maxRounds: GAME_RULES.maxRounds,
          createdAt: now,
          inviteCode: input.mode === 'friend' ? await this.newInviteCode(tx) : null,
          players: { create: { userId, seat: 0 } },
        },
      });
      return game.id;
    });
    return this.state(userId, gameId);
  }

  /** Um bot assume o lugar do adversário numa partida aleatória que ninguém pegou. */
  async attachBot(gameId: string, botId: string, now: Date): Promise<boolean> {
    return this.transaction(async (tx) => {
      await this.lock(tx, gameId);
      const game = await tx.game.findUnique({ where: { id: gameId }, include: { players: true } });
      if (!game || game.mode !== 'random' || game.status !== 'waiting_opponent' || game.players.length !== 1) return false;
      await tx.gamePlayer.create({ data: { gameId, userId: botId, seat: 1 } });
      await this.activate(tx, gameId, now, false);
      return true;
    });
  }

  async state(userId: string, gameId: string): Promise<GameState> {
    const now = this.clock.now();
    await this.transaction(async (tx) => {
      await this.lock(tx, gameId);
      await this.applyDeadlines(tx, gameId, userId, now);
    });
    const ctx = await this.context(this.prisma, gameId, userId);
    const { phase, pendingSpin, pendingPlay } = this.phaseOf(ctx);
    const opponent = ctx.game.players.find((p) => p.id !== ctx.me.id) ?? null;
    const winner = ctx.game.players.find((p) => p.id === ctx.game.winnerPlayerId);
    const choices =
      phase === 'choose_crown' ? crownChoices(snapshotOf(ctx.game), await this.selector.availableCategories(await this.localeOf(this.prisma, userId))) : [];
    return {
      id: ctx.game.id,
      mode: ctx.game.mode,
      status: ctx.game.status,
      phase,
      roundNumber: ctx.game.roundNumber,
      maxRounds: ctx.game.maxRounds,
      isMyTurn: ctx.isMyTurn,
      inviteCode: ctx.game.status === 'waiting_opponent' ? ctx.game.inviteCode : null,
      me: playerState(ctx.me),
      opponent: opponent ? playerState(opponent) : null,
      pendingSpin: pendingSpin
        ? { spinId: pendingSpin.id, result: pendingSpin.result, sliceIndex: sliceIndexOf(pendingSpin.result), prize: null }
        : null,
      pendingPlayId: pendingPlay?.id ?? null,
      crownChoices: choices,
      turnDeadlineAt: ctx.game.turnDeadlineAt?.toISOString() ?? null,
      winnerUserId: winner?.userId ?? null,
      lives: livesDto(await this.livesOf(this.prisma, userId, now)),
      roundPrize: await this.roundPrizeOf(ctx, userId),
      updatedAt: ctx.game.updatedAt.toISOString(),
    };
  }

  /**
   * Prêmio da rodada (Fases 9 e 12): aparece quando o último giro desta vez caiu na face do
   * Prêmio e se resgata assistindo a um anúncio. Some ao girar de novo. Não mexe na partida:
   * vale fora dela (moedas, vidas, ajudas do Golem World).
   */
  private async roundPrizeOf(ctx: Context, userId: string): Promise<GameState['roundPrize']> {
    if (!ctx.isMyTurn || !ctx.turn || ctx.game.status !== 'active' || ctx.me.user.isBot) return null;
    const prize = await this.rewards.roundPrize(userId, ctx.turn.id);
    if (!prize) return null;
    const last = await this.prisma.spin.findFirst({ where: { turnId: ctx.turn.id }, orderBy: { createdAt: 'desc' }, select: { result: true } });
    if (last?.result !== PRIZE_SLICE) return null;
    if (await this.rewards.roundPrizeClaimed(userId, ctx.turn.id)) return null;
    return { ref: ctx.turn.id, prize, claimed: false };
  }

  async list(userId: string): Promise<GameSummary[]> {
    const seats = await this.prisma.gamePlayer.findMany({
      where: { userId },
      orderBy: { game: { updatedAt: 'desc' } },
      take: 50,
      include: {
        game: {
          include: {
            ...GAME_INCLUDE,
            turns: { where: { endedAt: null }, include: TURN_INCLUDE, take: 1, orderBy: { startedAt: 'desc' } },
          },
        },
      },
    });
    const summaries = seats.map(({ game }) => {
      const me = game.players.find((p) => p.userId === userId)!;
      const opponent = game.players.find((p) => p.userId !== userId) ?? null;
      const isMyTurn = game.status === 'active' && game.currentPlayerId === me.id;
      const ctx: Context = { game, me, isMyTurn, turn: isMyTurn ? (game.turns[0] ?? null) : null };
      const winner = game.players.find((p) => p.id === game.winnerPlayerId);
      return {
        id: game.id,
        mode: game.mode,
        status: game.status,
        phase: this.phaseOf(ctx).phase,
        isMyTurn,
        opponentName: opponent?.user.displayName ?? null,
        opponentIsBot: opponent?.user.isBot ?? false,
        mySeals: me.seals.length,
        opponentSeals: opponent?.seals.length ?? 0,
        winnerUserId: winner?.userId ?? null,
        updatedAt: game.updatedAt.toISOString(),
      } satisfies GameSummary;
    });
    const rank = (s: GameSummary) => (s.isMyTurn ? 0 : s.status === 'active' || s.status === 'waiting_opponent' ? 1 : 2);
    return summaries.sort((a, b) => rank(a) - rank(b));
  }

  // -------------------------------------------------------------------------
  // Jogada
  // -------------------------------------------------------------------------

  async spin(userId: string, gameId: string, opts: { withPrize?: boolean } = {}): Promise<SpinResponse> {
    const now = this.clock.now();
    return this.transaction(async (tx) => {
      await this.lock(tx, gameId);
      await this.applyDeadlines(tx, gameId, userId, now);
      const ctx = await this.context(tx, gameId, userId);
      this.assertMyTurn(ctx);
      this.assertPhase(ctx, 'spin');
      const lives = await this.livesOf(tx, userId, now);
      if (lives.lives <= 0) {
        const wait = lives.nextLifeAt ? Math.max(1, Math.ceil((lives.nextLifeAt.getTime() - now.getTime()) / 60_000)) : LIVES_RULES.regenMinutes;
        throw Errors.conflict('NO_LIVES', 'Suas vidas acabaram. A próxima volta em {wait} min — enquanto isso, que tal estudar no Golem World?', { wait });
      }

      const available = await this.selector.availableCategories(await this.localeOf(tx, userId));
      if (available.length === 0) {
        throw Errors.unprocessable('NO_QUESTIONS', 'Ainda não há perguntas aprovadas. Revise as perguntas geradas em /admin.');
      }
      // A face do Prêmio só entra quando o app mostra anúncio e o prêmio da rodada ainda está de pé.
      const prize = opts.withPrize && !ctx.me.user.isBot ? await this.rewards.wheelPrizeOpen(tx, userId, ctx.turn!.id, now) : null;
      const slice = drawSlice(available, this.random, { prize: prize !== null });
      const spin = await tx.spin.create({
        data: { turnId: ctx.turn!.id, result: slice, ...(sliceNeedsQuestion(slice) ? {} : { consumedAt: now }) },
      });
      // Cair na Coroa enche a Coroa; nos outros casos só registramos atividade.
      await this.saveSnapshot(tx, ctx.game, applySpin(snapshotOf(ctx.game), slice), now);
      return {
        spinId: spin.id,
        result: slice,
        sliceIndex: sliceIndexOf(slice),
        prize: slice === PRIZE_SLICE && prize ? { ref: ctx.turn!.id, prize, claimed: false } : null,
      };
    });
  }

  private async servePlay(
    tx: Tx,
    ctx: Context,
    input: { category: CategoryId; isCrownChallenge: boolean; spinId: string | null },
    now: Date,
  ): Promise<QuestionForPlayer> {
    const locale = await this.localeOf(tx, ctx.me.userId);
    const question = await this.selector.pick(tx, { userId: ctx.me.userId, category: input.category, isCrownChallenge: input.isCrownChallenge, locale });
    const play = await tx.questionPlay.create({
      data: {
        turnId: ctx.turn!.id,
        spinId: input.spinId,
        playerId: ctx.me.id,
        userId: ctx.me.userId,
        questionId: question.id,
        category: input.category,
        difficulty: question.difficulty,
        source: input.isCrownChallenge ? 'crown_challenge' : 'wheel',
        optionOrder: shuffleOptions(OPTION_COUNT, this.random),
        servedAt: now,
        deadlineAt: new Date(now.getTime() + GAME_RULES.questionTimeLimitSeconds * 1000),
      },
      include: PLAY_INCLUDE,
    });
    return questionForPlayer(play, await localizeQuestion(tx, question, locale), now);
  }

  async requestQuestion(userId: string, gameId: string, spinId: string): Promise<QuestionForPlayer> {
    const now = this.clock.now();
    return this.transaction(async (tx) => {
      await this.lock(tx, gameId);
      await this.applyDeadlines(tx, gameId, userId, now);
      const ctx = await this.context(tx, gameId, userId);
      this.assertMyTurn(ctx);
      this.assertPhase(ctx, 'spun');
      const spin = ctx.turn!.spins.find((s) => s.id === spinId);
      if (!spin || !isCategoryId(spin.result)) throw Errors.conflict('SPIN_NOT_FOUND', 'Giro não encontrado ou já usado.');
      await tx.spin.update({ where: { id: spin.id }, data: { consumedAt: now } });
      return this.servePlay(tx, ctx, { category: spin.result, isCrownChallenge: false, spinId: spin.id }, now);
    });
  }

  async chooseCrown(userId: string, gameId: string, category: CategoryId): Promise<QuestionForPlayer> {
    const now = this.clock.now();
    return this.transaction(async (tx) => {
      await this.lock(tx, gameId);
      await this.applyDeadlines(tx, gameId, userId, now);
      const ctx = await this.context(tx, gameId, userId);
      this.assertMyTurn(ctx);
      this.assertPhase(ctx, 'choose_crown');
      const choices = crownChoices(snapshotOf(ctx.game), await this.selector.availableCategories(await this.localeOf(tx, userId)));
      if (!choices.includes(category)) {
        throw Errors.unprocessable('INVALID_CROWN_CATEGORY', 'Escolha uma categoria em que você ainda não tem selo.');
      }
      return this.servePlay(tx, ctx, { category, isCrownChallenge: true, spinId: null }, now);
    });
  }

  async currentQuestion(userId: string, gameId: string): Promise<QuestionForPlayer> {
    const ctx = await this.context(this.prisma, gameId, userId);
    const play = this.phaseOf(ctx).pendingPlay;
    if (!play) throw Errors.conflict('NO_OPEN_QUESTION', 'Não há pergunta aberta nesta partida.');
    const local = await localizeQuestion(this.prisma, play.question, await this.localeOf(this.prisma, userId));
    return questionForPlayer(play, local, this.clock.now());
  }

  /** Corrige uma pergunta aberta (resposta ou tempo esgotado) e aplica as regras. */
  private async resolvePlay(tx: Tx, game: LoadedGame, play: LoadedPlay, optionIndex: number | null, now: Date): Promise<AnswerResult> {
    const timedOut = optionIndex === null || isPlayExpired(play.deadlineAt, now);
    const chosen = timedOut ? null : (play.optionOrder[optionIndex!] ?? null);
    const question = play.question;
    const correct = chosen !== null && chosen === question.correctIndex;
    const { game: snap, outcome } = applyAnswer(snapshotOf(game), {
      correct,
      isCrownChallenge: play.source === 'crown_challenge',
      category: play.category,
      difficulty: play.difficulty,
    });

    await tx.questionPlay.update({
      where: { id: play.id },
      data: { answeredAt: now, chosenIndex: chosen, isCorrect: correct, pointsAwarded: outcome.points },
    });
    await tx.question.update({
      where: { id: question.id },
      data: { timesServed: { increment: 1 }, ...(correct ? { timesCorrect: { increment: 1 } } : {}) },
    });
    if (outcome.points > 0) {
      await tx.user.update({ where: { id: play.userId }, data: { totalPoints: { increment: outcome.points } } });
    }
    const lives = correct ? await this.livesOf(tx, play.userId, now) : await this.loseLife(tx, play.userId, now);
    await this.saveSnapshot(tx, game, snap, now);
    if (outcome.turnPassed || outcome.finished) await this.endTurn(tx, game.id, now);
    if (outcome.turnPassed) await this.startTurn(tx, game, snap.currentSeat!, snap.roundNumber, now);

    const local = await localizeQuestion(tx, question, await this.localeOf(tx, play.userId));
    const lang = question.evidenceLanguage as SourceLanguage;
    const passage = question.passage;
    // Perguntas de molde guardam a versão do texto citado na própria pergunta.
    const versionTitle = local.version ? local.version.title : passage ? ({ he: passage.heVersionTitle, en: passage.enVersionTitle, pt: passage.ptVersionTitle }[lang] ?? null) : question.versionTitle;
    const license = local.version ? local.version.license : passage ? ({ he: passage.heLicense, en: passage.enLicense, pt: passage.ptLicense }[lang] ?? null) : question.license;
    const winnerSeat = outcome.winnerSeat;
    return {
      correct,
      timedOut,
      correctOptionIndex: play.optionOrder.indexOf(question.correctIndex),
      pointsAwarded: outcome.points,
      explanation: local.explanation,
      source: {
        ref: question.sourceRef,
        url: sefariaUrlForRef(question.sourceRef),
        evidenceQuote: local.evidenceQuote,
        evidenceLanguage: local.evidenceLanguage,
        versionTitle,
        license,
        machineTranslated: local.machineTranslated,
      },
      crownProgress: outcome.crownProgress,
      sealEarned: outcome.sealEarned,
      canSpinAgain: outcome.canSpinAgain,
      crownReady: outcome.crownReady,
      turnPassed: outcome.turnPassed,
      gameFinished: outcome.finished,
      winnerUserId: winnerSeat === null ? null : (game.players.find((p) => p.seat === winnerSeat)?.userId ?? null),
      lives: livesDto(lives),
    };
  }

  async answer(userId: string, gameId: string, playId: string, optionIndex: number | null): Promise<AnswerResult> {
    const now = this.clock.now();
    return this.transaction(async (tx) => {
      await this.lock(tx, gameId);
      await this.applyDeadlines(tx, gameId, userId, now, playId);
      const ctx = await this.context(tx, gameId, userId);
      const play = await tx.questionPlay.findUnique({ where: { id: playId }, include: { ...PLAY_INCLUDE, turn: true } });
      if (!play || play.userId !== userId || play.turn.gameId !== gameId) throw Errors.notFound('Pergunta não encontrada.');
      if (play.answeredAt) throw Errors.conflict('ALREADY_ANSWERED', 'Esta pergunta já foi respondida (ou o tempo acabou).');
      this.assertMyTurn(ctx);
      return this.resolvePlay(tx, ctx.game, play, optionIndex, now);
    });
  }

  async forfeit(userId: string, gameId: string): Promise<GameState> {
    const now = this.clock.now();
    await this.transaction(async (tx) => {
      await this.lock(tx, gameId);
      const { game } = await this.load(tx, gameId, userId);
      if (game.status !== 'active' && game.status !== 'waiting_opponent') {
        throw Errors.conflict('GAME_NOT_ACTIVE', 'A partida já terminou.');
      }
      await this.forfeitLocked(tx, gameId, userId, now);
    });
    return this.state(userId, gameId);
  }

  /** Desiste de todas as partidas em andamento do usuário (usado na exclusão de conta). */
  async forfeitAllForUser(userId: string): Promise<number> {
    const now = this.clock.now();
    const open = await this.prisma.game.findMany({
      where: { status: { in: ['active', 'waiting_opponent'] }, players: { some: { userId } } },
      select: { id: true },
    });
    for (const { id } of open) {
      await this.transaction(async (tx) => {
        await this.lock(tx, id);
        await this.forfeitLocked(tx, id, userId, now);
      });
    }
    return open.length;
  }

  /** Com a partida já travada: convite aberto vira abandonado; partida ativa vira W.O. */
  private async forfeitLocked(tx: Tx, gameId: string, userId: string, now: Date): Promise<void> {
    const { game, me } = await this.load(tx, gameId, userId);
    if (game.status === 'waiting_opponent') {
      await tx.game.update({ where: { id: gameId }, data: { status: 'abandoned', finishedAt: now, inviteCode: null } });
      return;
    }
    if (game.status !== 'active') return;
    await this.saveSnapshot(tx, game, forfeitRule(snapshotOf(game), me.seat), now);
    await this.endTurn(tx, gameId, now);
  }
}
