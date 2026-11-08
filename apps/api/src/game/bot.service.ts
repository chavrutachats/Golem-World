/**
 * Bots da roleta. No modo aleatório, se ninguém entrar na partida em alguns segundos,
 * um bot (outro Golem, com nome de uma das sete espécies) assume o lugar do
 * adversário. O app mostra que é um bot.
 *
 * O bot joga pelas MESMAS rotas de regra do jogador (GameService.spin, requestQuestion,
 * chooseCrown, answer), então não há atalho: só a escolha da alternativa é dele. A
 * chance de acerto acompanha a taxa de acerto recente do adversário humano, um pouco
 * abaixo, e cai nas perguntas difíceis (`botAccuracy` em @trivia/shared). Bots não
 * aparecem no ranking e não gastam vidas.
 */
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type { PrismaClient } from '@trivia/db';
import { BOT_NAMES, BOT_RULES, ITEMS, botAccuracy } from '@trivia/shared';
import { CLOCK, PRISMA, RANDOM, type Clock, type RandomSource } from '../common/infra.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { GameService } from './game.service.js';
import { QuestionSelector } from './question-selector.service.js';

const TICK_MS = 2000;
const MAX_STEPS_PER_TURN = 40;

/** Tempo de "pensar" de um turno, estável para o mesmo turno. */
export function thinkMs(turnId: string): number {
  let h = 0;
  for (const ch of turnId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const { min, max } = BOT_RULES.thinkSeconds;
  return (min + (h % (max - min + 1))) * 1000;
}

@Injectable()
export class BotService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('bots');
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private readonly inFlight = new Set<string>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RANDOM) private readonly random: RandomSource,
    @Inject(GameService) private readonly games: GameService,
    @Inject(QuestionSelector) private readonly selector: QuestionSelector,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.botsEnabled) return;
    this.timer = setInterval(() => void this.tick().catch((e: unknown) => this.log.error(`bots: ${String(e)}`)), TICK_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Cria (uma vez) as contas dos bots, cada uma com uma kipá diferente. */
  async ensureBots(): Promise<{ id: string; displayName: string }[]> {
    const existing = await this.prisma.user.findMany({ where: { isBot: true }, select: { id: true, displayName: true } });
    const have = new Set(existing.map((b) => b.displayName));
    const heads = ITEMS.filter((i) => i.slot === 'head').map((i) => i.id);
    for (const [i, name] of BOT_NAMES.entries()) {
      if (have.has(name)) continue;
      const bot = await this.prisma.user.create({ data: { displayName: name, isBot: true, isGuest: false, locale: 'he' } });
      await this.prisma.userItem.create({ data: { userId: bot.id, itemId: heads[i % heads.length]!, equipped: true } });
      existing.push({ id: bot.id, displayName: name });
    }
    return existing;
  }

  /** Uma rodada: bots entram nas partidas paradas e jogam as vezes que são deles. */
  async tick(): Promise<{ joined: number; turns: number }> {
    if (this.busy) return { joined: 0, turns: 0 };
    this.busy = true;
    try {
      const joined = await this.joinWaitingGames();
      const turns = await this.playPendingTurns();
      return { joined, turns };
    } finally {
      this.busy = false;
    }
  }

  async joinWaitingGames(): Promise<number> {
    const now = this.clock.now();
    const waiting = await this.prisma.game.findMany({
      where: { mode: 'random', status: 'waiting_opponent', createdAt: { lte: new Date(now.getTime() - BOT_RULES.joinAfterSeconds * 1000) } },
      select: { id: true, players: { select: { userId: true } } },
      take: 20,
    });
    if (!waiting.length) return 0;
    const bots = await this.ensureBots();
    let joined = 0;
    for (const game of waiting) {
      const bot = bots[this.random.int(bots.length)]!;
      if (await this.games.attachBot(game.id, bot.id, now)) joined++;
    }
    return joined;
  }

  async playPendingTurns(): Promise<number> {
    const now = this.clock.now();
    const games = await this.prisma.game.findMany({
      where: { status: 'active', players: { some: { user: { isBot: true } } } },
      select: {
        id: true,
        currentPlayerId: true,
        players: { select: { id: true, userId: true, user: { select: { isBot: true } } } },
        turns: { where: { endedAt: null }, select: { id: true, startedAt: true }, take: 1 },
      },
      take: 50,
    });
    let played = 0;
    for (const g of games) {
      const current = g.players.find((p) => p.id === g.currentPlayerId);
      const turn = g.turns[0];
      if (!current?.user.isBot || !turn || this.inFlight.has(g.id)) continue;
      if (now.getTime() - turn.startedAt.getTime() < thinkMs(turn.id)) continue;
      const human = g.players.find((p) => !p.user.isBot);
      this.inFlight.add(g.id);
      try {
        await this.playTurn(g.id, current.userId, human?.userId ?? null);
        played++;
      } catch (error) {
        this.log.warn(`bot não conseguiu jogar a partida ${g.id}: ${String(error)}`);
      } finally {
        this.inFlight.delete(g.id);
      }
    }
    return played;
  }

  /** Joga a vez inteira do bot: gira, responde, enche a Coroa… até a vez passar. */
  async playTurn(gameId: string, botId: string, humanId: string | null): Promise<void> {
    const accuracy = humanId ? await this.selector.recentAccuracy(this.prisma, humanId) : null;
    for (let step = 0; step < MAX_STEPS_PER_TURN; step++) {
      const state = await this.games.state(botId, gameId);
      if (!state.isMyTurn || state.status !== 'active') return;
      let playId: string | null = null;
      if (state.phase === 'spin') {
        const spin = await this.games.spin(botId, gameId);
        if (spin.result === 'crown') continue;
        playId = (await this.games.requestQuestion(botId, gameId, spin.spinId)).playId;
      } else if (state.phase === 'spun' && state.pendingSpin) {
        playId = (await this.games.requestQuestion(botId, gameId, state.pendingSpin.spinId)).playId;
      } else if (state.phase === 'choose_crown') {
        const choice = state.crownChoices[this.random.int(state.crownChoices.length)];
        if (!choice) return;
        playId = (await this.games.chooseCrown(botId, gameId, choice)).playId;
      } else if (state.phase === 'question' && state.pendingPlayId) {
        playId = state.pendingPlayId;
      } else {
        return;
      }
      const play = await this.prisma.questionPlay.findUniqueOrThrow({
        where: { id: playId },
        select: { optionOrder: true, difficulty: true, question: { select: { correctIndex: true } } },
      });
      const correctPos = play.optionOrder.indexOf(play.question.correctIndex);
      const hit = this.random.int(1000) < botAccuracy(accuracy, play.difficulty) * 1000;
      const wrong = [0, 1, 2, 3].filter((i) => i !== correctPos);
      const option = hit ? correctPos : wrong[this.random.int(wrong.length)]!;
      const result = await this.games.answer(botId, gameId, playId, option);
      if (result.turnPassed || result.gameFinished) return;
    }
  }
}
