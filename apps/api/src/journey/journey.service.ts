/**
 * Golem World no servidor: mapa, fases (corridas), perguntas, respostas, poderes dos
 * itens, moedas e prêmios. A correção e o prazo ficam no servidor, como na roleta:
 * o app nunca recebe o gabarito antes de responder.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { JourneyAnswer, JourneyRun, Prisma, PrismaClient, Question } from '@trivia/db';
import {
  BOOST_RULES,
  ITEMS,
  JOURNEY_RULES,
  OPTION_COUNT,
  SUB_TRACKS,
  TORAH_BOOKS,
  WORLDS,
  allTracksDone,
  answerCoins,
  beitMidrashNodeId,
  classifyAnswer,
  completionCoins,
  currentMainNode,
  difficultyForSkill,
  lookFromItems,
  newlyOpened,
  nextSkill,
  nodeKind,
  nodeState,
  obstacleCount,
  parashaById,
  parashaName,
  parashaNodeId,
  parashotOfBook,
  parseNodeId,
  passedObstacle,
  perksOf,
  renderDivineNamesForDisplay,
  sefariaUrlForRef,
  starsFor,
  itemPrice,
  type AnswerOutcome,
  type BoostCounts,
  type GolemLook,
  type ItemSlot,
  type JourneyAnswerResult,
  type JourneyNode,
  type JourneyQuestion,
  type JourneyRun as JourneyRunDto,
  type JourneyState,
  type JourneyTrack,
  type NodeState,
  type JourneyPower,
  type PowerUpResult,
  type ShopState,
  type SourceLanguage,
  type Locale,
  type PrepStatus,
  catalogText,
  isTranslatedLocale,
  localeFromTag,
  shortRef,
} from '@trivia/shared';
import { Errors } from '../common/http.js';
import { CLOCK, PRISMA, RANDOM, type Clock, type RandomSource } from '../common/infra.js';
import { WalletService } from '../economy/wallet.service.js';
import { shuffleOptions } from '../game/rules.js';
import { localizeQuestion, type LocalizedQuestion } from '../questions/localized.js';
import { optionsDirection, QuestionFactory } from '../questions/question-factory.service.js';
import { TranslationService } from '../translation/translation.service.js';
import { journeyPrepPlan } from './prep.js';

type Tx = Prisma.TransactionClient;

const GRACE_MS = JOURNEY_RULES.networkGraceSeconds * 1000;

function iso(d: Date): string {
  return d.toISOString();
}

/** Itens vestidos → aparência do Golem, um item por espaço. */
export function lookOf(items: readonly { itemId: string; equipped: boolean }[]): GolemLook {
  return lookFromItems(items);
}

function runDto(run: JourneyRun, openAnswerId: string | null, skill: number, boosts: BoostCounts): JourneyRunDto {
  return {
    runId: run.id,
    nodeId: run.nodeId,
    status: run.status,
    hearts: run.hearts,
    maxHearts: run.maxHearts,
    obstacleIndex: run.obstacleIndex,
    obstacleCount: run.obstacleCount,
    coins: run.coins,
    powerUps: { eliminate: run.eliminateLeft, skip: run.skipLeft, hint: run.hintLeft },
    boosts,
    revived: run.revivedAt !== null,
    firstMistakeFree: run.forgiveLeft > 0,
    timeLimitSeconds: run.timeLimitSec,
    level: difficultyForSkill(skill),
    openAnswerId,
  };
}

function howToEarn(itemId: string, locale: Locale): string | null {
  const item = ITEMS.find((i) => i.id === itemId);
  if (!item) return null;
  switch (item.unlock.kind) {
    case 'parasha': {
      const parasha = parashaById(item.unlock.parashaId);
      const name = parasha ? parashaName(parasha, locale) : item.unlock.parashaId;
      return { pt: `Complete a Torá de ${name} para liberar.`, en: `Complete the Torah of ${name} to unlock.`, he: `השלימו את התורה של פרשת ${name} כדי לפתוח.` }[locale];
    }
    case 'beitMidrash': {
      const w = WORLDS.find((x) => x.id === (item.unlock as { book: string }).book)!;
      const name = catalogText(w.beitMidrash.namePt, locale);
      return { pt: `Prêmio da ${name} (Mundo ${w.number}).`, en: `Prize of the ${name} (World ${w.number}).`, he: `פרס של ${name} (עולם ${w.number}).` }[locale];
    }
    case 'allTracksOfAParasha':
      return { pt: 'Complete todos os caminhos de uma parashá.', en: 'Complete every path of a parashah.', he: 'השלימו את כל השבילים של פרשה אחת.' }[locale];
    default:
      return null;
  }
}

const HINT_COPY: Readonly<Record<Locale, (ref: string) => string>> = {
  pt: (ref) => `Sua chavruta lembra: a resposta está em ${ref}.`,
  en: (ref) => `Your chavruta reminds you: the answer is in ${ref}.`,
  he: (ref) => `החברותא מזכירה: התשובה נמצאת ב${ref}.`,
};

@Injectable()
export class JourneyService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RANDOM) private readonly random: RandomSource,
    @Inject(QuestionFactory) private readonly factory: QuestionFactory,
    @Inject(TranslationService) private readonly translations: TranslationService,
    @Inject(WalletService) private readonly wallet: WalletService,
  ) {}

  /** Estado da fase para o app (com a mochila de ajudas, que é do jogador). */
  private async dto(db: Tx | PrismaClient, run: JourneyRun, openAnswerId: string | null, skill?: number): Promise<JourneyRunDto> {
    const [s, boosts] = await Promise.all([skill ?? this.skill(db, run.userId), this.wallet.boosts(db, run.userId)]);
    return runDto(run, openAnswerId, s, boosts);
  }

  private async localeOf(db: Tx | PrismaClient, userId: string): Promise<Locale> {
    const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { locale: true } });
    return localeFromTag(u.locale);
  }

  // -------------------------------------------------------------------------
  // Preparo no idioma do jogador (Fase 8)
  // -------------------------------------------------------------------------

  /**
   * Garante que a fase tem textos no idioma do jogador. Em hebraico está sempre
   * pronta; em pt/en, traduz em segundo plano o que faltar e o app acompanha.
   */
  async prepare(userId: string, nodeId: string): Promise<PrepStatus> {
    const node = parseNodeId(nodeId);
    if (!node) throw Errors.unprocessable('INVALID_NODE', 'Fase desconhecida.');
    const locale = await this.localeOf(this.prisma, userId);
    if (!isTranslatedLocale(locale)) return { status: 'ready', done: 0, total: 0 };
    const key = `journey:${locale}:${nodeId}`;
    const running = this.translations.status(key);
    if (running?.status === 'preparing') return { status: 'preparing', done: running.done, total: running.total };
    const plan = await journeyPrepPlan(this.prisma, this.factory, node, locale, this.random);
    const missing = await this.translations.missingSegments(plan.ids, locale);
    if (plan.ready && missing.length === 0) return { status: 'ready', done: 0, total: 0 };
    if (!this.translations.enabled) {
      return plan.ready ? { status: 'ready', done: 0, total: 0 } : { status: 'unavailable', done: 0, total: 0 };
    }
    if (missing.length === 0) return { status: plan.ready ? 'ready' : 'unavailable', done: 0, total: 0 };
    const state = this.translations.prepare(key, missing.length, async (progress) => {
      await this.translations.ensureSegments(missing, locale, progress);
      this.factory.invalidateLocale(locale);
    });
    if (state.status === 'ready') return { status: 'ready', done: state.done, total: state.total };
    return { status: 'preparing', done: state.done, total: state.total };
  }

  private transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 20_000, maxWait: 10_000 });
  }

  /** Todo jogador começa com a kipá azul vestida. */
  private async ensureStarter(db: Tx | PrismaClient, userId: string): Promise<void> {
    const count = await db.userItem.count({ where: { userId } });
    if (count === 0) {
      await db.userItem.createMany({
        data: ITEMS.filter((i) => i.unlock.kind === 'starter').map((i) => ({ userId, itemId: i.id, equipped: true })),
        skipDuplicates: true,
      });
    }
  }

  async golemLook(userId: string): Promise<GolemLook> {
    await this.ensureStarter(this.prisma, userId);
    const items = await this.prisma.userItem.findMany({ where: { userId }, select: { itemId: true, equipped: true } });
    return lookOf(items);
  }

  private async completedSet(db: Tx | PrismaClient, userId: string) {
    const rows = await db.journeyProgress.findMany({ where: { userId }, select: { nodeId: true, bestStars: true } });
    return { completed: new Set(rows.map((r) => r.nodeId)), stars: new Map(rows.map((r) => [r.nodeId, r.bestStars])) };
  }

  private async nodeAvailable(node: JourneyNode): Promise<boolean> {
    if (node.kind === 'beit-midrash') {
      const availability = await this.factory.availability();
      return parashotOfBook(node.book).some((p) => availability.get(p.id)?.has('torah'));
    }
    return this.factory.hasContent(node.parashaId, node.track);
  }

  // -------------------------------------------------------------------------
  // Mapa
  // -------------------------------------------------------------------------

  async state(userId: string): Promise<JourneyState> {
    await this.ensureStarter(this.prisma, userId);
    const [user, { completed, stars }, items, active, availability] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true, journeySkill: true } }),
      this.completedSet(this.prisma, userId),
      this.prisma.userItem.findMany({ where: { userId }, select: { itemId: true, equipped: true } }),
      this.prisma.journeyRun.findFirst({ where: { userId, status: 'active' }, select: { id: true } }),
      this.factory.availability(),
    ]);
    const status = (nodeId: string, available: boolean) => ({
      nodeId,
      state: nodeState(nodeId, completed) as NodeState,
      stars: stars.get(nodeId) ?? 0,
      available,
    });
    const worlds = TORAH_BOOKS.map((book) => {
      const parashot = parashotOfBook(book).map((p) => {
        const has = availability.get(p.id) ?? new Set<JourneyTrack>();
        return {
          parashaId: p.id,
          main: status(parashaNodeId(p.id), has.has('torah')),
          tracks: SUB_TRACKS.map((t) => ({ ...status(parashaNodeId(p.id, t), has.has(t)), track: t })),
        };
      });
      return {
        book,
        unlocked: parashot[0]!.main.state !== 'locked',
        parashot,
        beitMidrash: status(beitMidrashNodeId(book), parashot.some((p) => p.main.available)),
      };
    });
    return {
      coins: user.coins,
      skill: user.journeySkill,
      level: difficultyForSkill(user.journeySkill),
      golem: lookOf(items),
      currentNodeId: currentMainNode(completed),
      worlds,
      activeRunId: active?.id ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Fases
  // -------------------------------------------------------------------------

  async startRun(userId: string, nodeId: string): Promise<JourneyRunDto> {
    const node = parseNodeId(nodeId);
    if (!node) throw Errors.unprocessable('INVALID_NODE', 'Fase desconhecida.');
    const now = this.clock.now();
    const { completed } = await this.completedSet(this.prisma, userId);
    if (nodeState(nodeId, completed) === 'locked') {
      throw Errors.conflict('NODE_LOCKED', node.kind === 'parasha' && node.track !== 'torah'
        ? 'Os caminhos desta parashá abrem depois que você completa a Torá dela.'
        : 'Esta fase ainda está fechada no mapa.');
    }
    if (!(await this.nodeAvailable(node))) {
      throw Errors.unprocessable('NO_QUESTIONS', 'Esta trilha ainda não tem textos. Ela abre assim que os textos forem carregados.');
    }
    await this.ensureStarter(this.prisma, userId);
    const items = await this.prisma.userItem.findMany({ where: { userId, equipped: true }, select: { itemId: true } });
    const perks = perksOf(lookOfIds(items.map((i) => i.itemId)));
    const hearts = Math.min(JOURNEY_RULES.maxHearts, JOURNEY_RULES.hearts + perks.extraHearts);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { journeySkill: true } });
    const run = await this.transaction(async (tx) => {
      await tx.journeyRun.updateMany({ where: { userId, status: 'active' }, data: { status: 'abandoned', endedAt: now } });
      return tx.journeyRun.create({
        data: {
          userId,
          nodeId,
          hearts,
          maxHearts: hearts,
          obstacleCount: obstacleCount(node),
          timeLimitSec: JOURNEY_RULES.questionTimeLimitSeconds + perks.extraTimeSeconds,
          coinBonusPct: perks.coinBonusPct,
          forgiveLeft: perks.firstMistakeFree ? 1 : 0,
          eliminateLeft: perks.powerUps.eliminate,
          skipLeft: perks.powerUps.skip,
          hintLeft: perks.powerUps.hint,
        },
      });
    });
    return this.dto(this.prisma, run, null, user.journeySkill);
  }

  private async loadRun(db: Tx | PrismaClient, userId: string, runId: string): Promise<JourneyRun> {
    const run = await db.journeyRun.findUnique({ where: { id: runId } });
    if (!run || run.userId !== userId) throw Errors.notFound('Fase não encontrada.');
    return run;
  }

  private async lockRun(tx: Tx, runId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "JourneyRun" WHERE id = ${runId}::uuid FOR UPDATE`;
  }

  async getRun(userId: string, runId: string): Promise<JourneyRunDto> {
    const run = await this.loadRun(this.prisma, userId, runId);
    const open = await this.prisma.journeyAnswer.findFirst({ where: { runId, answeredAt: null }, select: { id: true } });
    return this.dto(this.prisma, run, open?.id ?? null);
  }

  private questionDto(answer: JourneyAnswer, question: Question, local: LocalizedQuestion, run: JourneyRun, now: Date): JourneyQuestion {
    const options = answer.optionOrder.map((i) => local.options[i]!);
    return {
      answerId: answer.id,
      obstacleIndex: answer.obstacleIndex,
      track: (question.track ?? 'torah') as JourneyTrack,
      difficulty: answer.difficulty,
      text: local.text,
      context: local.context,
      options,
      optionsDirection: optionsDirection(options),
      eliminated: [...answer.eliminated],
      servedAt: iso(answer.servedAt),
      deadlineAt: iso(answer.deadlineAt),
      serverNow: iso(now),
      timeLimitSeconds: run.timeLimitSec,
      timeAdded: answer.timeAdded,
    };
  }

  /** Próxima pergunta da fase (ou a que está aberta, se o app recarregou). */
  async nextQuestion(userId: string, runId: string): Promise<JourneyQuestion> {
    const now = this.clock.now();
    return this.transaction(async (tx) => {
      await this.lockRun(tx, runId);
      let run = await this.loadRun(tx, userId, runId);
      const locale = await this.localeOf(tx, userId);
      const open = await tx.journeyAnswer.findFirst({ where: { runId, answeredAt: null }, include: { question: true } });
      if (open) {
        if (now.getTime() <= open.deadlineAt.getTime() + GRACE_MS) {
          return this.questionDto(open, open.question, await localizeQuestion(tx, open.question, locale), run, now);
        }
        await this.resolve(tx, run, open, open.question, null, now, null);
        run = await this.loadRun(tx, userId, runId);
      }
      if (run.status !== 'active') throw Errors.conflict('RUN_OVER', 'Esta fase já terminou.');
      const node = parseNodeId(run.nodeId)!;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { journeySkill: true } });
      const difficulty = difficultyForSkill(user.journeySkill);
      const parashaIds = node.kind === 'beit-midrash' ? parashotOfBook(node.book).map((p) => p.id) : [node.parashaId];
      const track: JourneyTrack = node.kind === 'beit-midrash' ? 'torah' : node.track;
      // Nada de repetir na mesma fase.
      const question = await this.pickFresh(tx, run, { userId, parashaIds, track, difficulty, review: node.kind === 'beit-midrash', locale });
      const answer = await tx.journeyAnswer.create({
        data: {
          runId,
          userId,
          questionId: question.id,
          obstacleIndex: run.obstacleIndex,
          difficulty,
          optionOrder: shuffleOptions(OPTION_COUNT, this.random),
          servedAt: now,
          deadlineAt: new Date(now.getTime() + run.timeLimitSec * 1000),
        },
      });
      return this.questionDto(answer, question, await localizeQuestion(tx, question, locale), run, now);
    });
  }

  private async pickFresh(tx: Tx, run: JourneyRun, input: Parameters<QuestionFactory['journeyQuestion']>[1]): Promise<Question> {
    const used = new Set((await tx.journeyAnswer.findMany({ where: { runId: run.id }, select: { questionId: true } })).map((a) => a.questionId));
    let last: Question | null = null;
    for (let i = 0; i < 4; i++) {
      last = await this.factory.journeyQuestion(tx, input);
      if (!used.has(last.id)) return last;
    }
    return last!;
  }

  async answer(userId: string, runId: string, answerId: string, optionIndex: number | null): Promise<JourneyAnswerResult> {
    const now = this.clock.now();
    return this.transaction(async (tx) => {
      await this.lockRun(tx, runId);
      const run = await this.loadRun(tx, userId, runId);
      const answer = await tx.journeyAnswer.findUnique({ where: { id: answerId }, include: { question: true } });
      if (!answer || answer.runId !== runId) throw Errors.notFound('Pergunta não encontrada.');
      if (answer.answeredAt) throw Errors.conflict('ALREADY_ANSWERED', 'Esta pergunta já foi respondida (ou o tempo acabou).');
      if (run.status !== 'active') throw Errors.conflict('RUN_OVER', 'Esta fase já terminou.');
      if (optionIndex !== null && answer.eliminated.includes(optionIndex)) {
        throw Errors.unprocessable('OPTION_ELIMINATED', 'Esta alternativa foi eliminada.');
      }
      return this.resolve(tx, run, answer, answer.question, optionIndex, now, null);
    });
  }

  /** Corrige, aplica corações, moedas, dificuldade e, se for o caso, a conclusão da fase. */
  private async resolve(
    tx: Tx,
    run: JourneyRun,
    answer: JourneyAnswer,
    question: Question,
    optionIndex: number | null,
    now: Date,
    forced: AnswerOutcome | null,
  ): Promise<JourneyAnswerResult> {
    // O prazo da própria pergunta (com os segundos a mais, se ganhou).
    const limitMs = answer.deadlineAt.getTime() - answer.servedAt.getTime();
    const expired = now.getTime() > answer.deadlineAt.getTime() + GRACE_MS;
    const timedOut = !forced && (optionIndex === null || expired);
    const chosen = timedOut || forced ? null : (answer.optionOrder[optionIndex!] ?? null);
    const correct = chosen !== null && chosen === question.correctIndex;
    const outcome: AnswerOutcome =
      forced ?? classifyAnswer({ correct, timedOut, elapsedMs: now.getTime() - answer.servedAt.getTime(), limitMs });
    const passed = passedObstacle(outcome);
    const coins = answerCoins(outcome, run.coinBonusPct);

    let { hearts, heartsLost, forgiveLeft, obstacleIndex } = run;
    let forgiven = false;
    if (passed) obstacleIndex = Math.min(run.obstacleCount, obstacleIndex + 1);
    else if (forgiveLeft > 0) {
      forgiveLeft--;
      forgiven = true;
    } else {
      hearts = Math.max(0, hearts - 1);
      heartsLost++;
    }
    const status = obstacleIndex >= run.obstacleCount ? 'completed' : hearts <= 0 ? 'failed' : 'active';

    await tx.journeyAnswer.update({
      where: { id: answer.id },
      data: { answeredAt: now, chosenIndex: chosen, isCorrect: forced ? null : correct, outcome, coins },
    });
    if (!forced) {
      await tx.question.update({
        where: { id: question.id },
        data: { timesServed: { increment: 1 }, ...(correct ? { timesCorrect: { increment: 1 } } : {}) },
      });
    }
    const user = await tx.user.findUniqueOrThrow({ where: { id: run.userId }, select: { journeySkill: true } });
    const skill = nextSkill(user.journeySkill, outcome);
    const updated = await tx.journeyRun.update({
      where: { id: run.id },
      data: {
        hearts,
        heartsLost,
        forgiveLeft,
        obstacleIndex,
        coins: { increment: coins },
        status,
        ...(status !== 'active' ? { endedAt: now } : {}),
      },
    });
    await tx.user.update({ where: { id: run.userId }, data: { journeySkill: skill } });
    if (coins) await this.wallet.apply(tx, { userId: run.userId, currency: 'coins', delta: coins, reason: 'journey', ref: run.id, idempotencyKey: `journey:${answer.id}` });

    const completion = status === 'completed' ? await this.complete(tx, updated, now) : null;
    const runAfter = completion ? await tx.journeyRun.findUniqueOrThrow({ where: { id: run.id } }) : updated;

    const locale = await this.localeOf(tx, run.userId);
    const local = await localizeQuestion(tx, question, locale);
    const lang = question.evidenceLanguage as SourceLanguage;
    const passage = question.passageId
      ? await tx.sourcePassage.findUnique({
          where: { id: question.passageId },
          select: { heVersionTitle: true, heLicense: true, enVersionTitle: true, enLicense: true, ptVersionTitle: true, ptLicense: true },
        })
      : null;
    const versionTitle = local.version ? local.version.title : passage ? { he: passage.heVersionTitle, en: passage.enVersionTitle, pt: passage.ptVersionTitle }[lang] : question.versionTitle;
    const license = local.version ? local.version.license : passage ? { he: passage.heLicense, en: passage.enLicense, pt: passage.ptLicense }[lang] : question.license;
    return {
      correct,
      timedOut,
      outcome,
      passed,
      forgiven,
      correctOptionIndex: answer.optionOrder.indexOf(question.correctIndex),
      explanation: local.explanation,
      source: {
        ref: question.sourceRef,
        url: sefariaUrlForRef(question.sourceRef),
        quote: local.evidenceQuote,
        language: local.evidenceLanguage,
        versionTitle: versionTitle ?? null,
        license: license ?? null,
        machineTranslated: local.machineTranslated,
      },
      coinsAwarded: coins + (completion?.bonusCoins ?? 0),
      run: await this.dto(tx, runAfter, null, skill),
      nextLevel: difficultyForSkill(skill),
      completion,
    };
  }

  private async complete(tx: Tx, run: JourneyRun, now: Date): Promise<JourneyAnswerResult['completion']> {
    const node = parseNodeId(run.nodeId)!;
    const { completed } = await this.completedSet(tx, run.userId);
    const previous = await tx.journeyProgress.findUnique({ where: { userId_nodeId: { userId: run.userId, nodeId: run.nodeId } } });
    const stars = starsFor(run.heartsLost);
    const firstTime = !previous;
    const bestStars = Math.max(stars, previous?.bestStars ?? 0) as 1 | 2 | 3;
    if (previous) {
      await tx.journeyProgress.update({
        where: { id: previous.id },
        data: { bestStars, completions: { increment: 1 }, lastCompletedAt: now },
      });
    } else {
      await tx.journeyProgress.create({ data: { userId: run.userId, nodeId: run.nodeId, bestStars, firstCompletedAt: now, lastCompletedAt: now } });
    }
    const bonusCoins = completionCoins(nodeKind(node), stars, firstTime, run.coinBonusPct);
    if (bonusCoins) {
      await this.wallet.apply(tx, { userId: run.userId, currency: 'coins', delta: bonusCoins, reason: 'completion', ref: run.id, idempotencyKey: `completion:${run.id}` });
      await tx.journeyRun.update({ where: { id: run.id }, data: { coins: { increment: bonusCoins } } });
    }

    const opened = firstTime ? newlyOpened(run.nodeId, completed) : [];
    const after = new Set(completed).add(run.nodeId);
    const rewards: string[] = [];
    if (node.kind === 'beit-midrash') {
      for (const item of ITEMS) if (item.unlock.kind === 'beitMidrash' && item.unlock.book === node.book) rewards.push(item.id);
    }
    if (node.kind === 'parasha' && node.track !== 'torah') {
      const available = [...((await this.factory.availability()).get(node.parashaId) ?? [])];
      if (allTracksDone(node.parashaId, after, available)) {
        for (const item of ITEMS) if (item.unlock.kind === 'allTracksOfAParasha') rewards.push(item.id);
      }
    }
    const owned = new Set((await tx.userItem.findMany({ where: { userId: run.userId }, select: { itemId: true } })).map((i) => i.itemId));
    const fresh = rewards.filter((id) => !owned.has(id));
    if (fresh.length) await tx.userItem.createMany({ data: fresh.map((itemId) => ({ userId: run.userId, itemId })), skipDuplicates: true });
    return { stars, bestStars, firstTime, bonusCoins, opened, rewards: fresh };
  }

  /**
   * Usa um poder na pergunta aberta. Primeiro a cota dos itens vestidos; quando ela
   * acaba, uma ajuda da mochila (Fase 9). A dica é só da chavruta; o tempo extra é só
   * da mochila. Tudo vale só no Golem World.
   */
  async powerUp(userId: string, runId: string, answerId: string, kind: JourneyPower): Promise<PowerUpResult> {
    const now = this.clock.now();
    return this.transaction(async (tx) => {
      await this.lockRun(tx, runId);
      const run = await this.loadRun(tx, userId, runId);
      if (run.status !== 'active') throw Errors.conflict('RUN_OVER', 'Esta fase já terminou.');
      const answer = await tx.journeyAnswer.findUnique({ where: { id: answerId }, include: { question: true } });
      if (!answer || answer.runId !== runId) throw Errors.notFound('Pergunta não encontrada.');
      if (answer.answeredAt) throw Errors.conflict('ALREADY_ANSWERED', 'Esta pergunta já foi respondida.');
      if (now.getTime() > answer.deadlineAt.getTime() + GRACE_MS) throw Errors.conflict('TIME_UP', 'O tempo desta pergunta acabou.');
      const correctPos = answer.optionOrder.indexOf(answer.question.correctIndex);
      const wrong = [0, 1, 2, 3].filter((i) => i !== correctPos && !answer.eliminated.includes(i));

      // O poder faz sentido nesta pergunta? (antes de gastar qualquer coisa)
      if (kind === 'hint' && answer.hintUsed) throw Errors.conflict('HINT_USED', 'Você já pediu dica nesta pergunta.');
      if (kind === 'time' && answer.timeAdded) throw Errors.conflict('TIME_ADDED', 'Você já ganhou tempo nesta pergunta.');
      if ((kind === 'eliminate' || kind === 'hint') && wrong.length === 0) {
        throw Errors.conflict('NOTHING_TO_ELIMINATE', 'Já não há alternativas erradas para tirar.');
      }

      const itemLeft = { skip: run.skipLeft, eliminate: run.eliminateLeft, hint: run.hintLeft, time: 0 }[kind];
      let source: 'item' | 'boost' = 'item';
      if (itemLeft <= 0) {
        if (kind === 'hint') throw Errors.conflict('NO_POWER', 'Sua chavruta já deu todas as dicas desta fase.');
        if (!(await this.wallet.consumeBoost(tx, userId, kind))) throw Errors.conflict('NO_POWER', 'Você não tem mais este poder nesta fase.');
        source = 'boost';
      }
      const charge: Prisma.JourneyRunUpdateInput =
        source !== 'item' ? {} : kind === 'skip' ? { skipLeft: { decrement: 1 } } : kind === 'eliminate' ? { eliminateLeft: { decrement: 1 } } : { hintLeft: { decrement: 1 } };

      if (kind === 'skip') {
        const charged = source === 'item' ? await tx.journeyRun.update({ where: { id: run.id }, data: charge }) : run;
        const result = await this.resolve(tx, charged, answer, answer.question, null, now, 'skipped');
        return { kind, source, answer: result, run: result.run };
      }
      if (kind === 'time') {
        const deadlineAt = new Date(answer.deadlineAt.getTime() + BOOST_RULES.timeSeconds * 1000);
        await tx.journeyAnswer.update({ where: { id: answer.id }, data: { deadlineAt, timeAdded: true } });
        return { kind, source, deadlineAt: iso(deadlineAt), run: await this.dto(tx, run, answer.id) };
      }
      if (kind === 'eliminate') {
        const remove = this.pickSome(wrong, 2);
        await tx.journeyAnswer.update({ where: { id: answer.id }, data: { eliminated: [...answer.eliminated, ...remove] } });
        const after = source === 'item' ? await tx.journeyRun.update({ where: { id: run.id }, data: charge }) : run;
        return { kind, source, eliminated: [...answer.eliminated, ...remove], run: await this.dto(tx, after, answer.id) };
      }
      // Dica da chavruta: aponta o capítulo onde procurar e tira uma alternativa errada.
      const remove = this.pickSome(wrong, 1);
      await tx.journeyAnswer.update({ where: { id: answer.id }, data: { hintUsed: true, eliminated: [...answer.eliminated, ...remove] } });
      const after = await tx.journeyRun.update({ where: { id: run.id }, data: charge });
      const chapterRef = answer.question.sourceRef.replace(/:\d+(?:-\d+)?$/, '').replace(/:\d+$/, '');
      const locale = await this.localeOf(tx, userId);
      return {
        kind,
        source,
        eliminated: [...answer.eliminated, ...remove],
        hint: { ref: chapterRef, url: sefariaUrlForRef(chapterRef), text: HINT_COPY[locale](shortRef(chapterRef, locale)) },
        run: await this.dto(tx, after, answer.id),
      };
    });
  }

  private pickSome<T>(list: readonly T[], n: number): T[] {
    const pool = [...list];
    const out: T[] = [];
    while (out.length < n && pool.length) out.push(pool.splice(this.random.int(pool.length), 1)[0]!);
    return out;
  }

  private async skill(db: Tx | PrismaClient, userId: string): Promise<number> {
    return (await db.user.findUniqueOrThrow({ where: { id: userId }, select: { journeySkill: true } })).journeySkill;
  }

  async abandon(userId: string, runId: string): Promise<JourneyRunDto> {
    const now = this.clock.now();
    return this.transaction(async (tx) => {
      await this.lockRun(tx, runId);
      const run = await this.loadRun(tx, userId, runId);
      const after =
        run.status === 'active' ? await tx.journeyRun.update({ where: { id: runId }, data: { status: 'abandoned', endedAt: now } }) : run;
      return this.dto(tx, after, null);
    });
  }

  // -------------------------------------------------------------------------
  // Armário
  // -------------------------------------------------------------------------

  async shop(userId: string): Promise<ShopState> {
    await this.ensureStarter(this.prisma, userId);
    const [user, items, { completed }] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true, shekels: true, locale: true } }),
      this.prisma.userItem.findMany({ where: { userId }, select: { itemId: true, equipped: true } }),
      this.completedSet(this.prisma, userId),
    ]);
    const owned = new Map(items.map((i) => [i.itemId, i.equipped]));
    const locale = localeFromTag(user.locale);
    return {
      coins: user.coins,
      shekels: user.shekels,
      golem: lookOf(items),
      items: ITEMS.map((item) => {
        const price = itemPrice(item);
        const isOwned = owned.has(item.id);
        const purchasable = !isOwned && price !== null && unlockMet(item, completed);
        return {
          id: item.id,
          owned: isOwned,
          equipped: owned.get(item.id) ?? false,
          price: price?.amount ?? null,
          currency: price?.currency ?? null,
          purchasable,
          howToEarn: isOwned || purchasable ? null : howToEarn(item.id, locale),
        };
      }),
    };
  }

  /**
   * Compra no armário, na moeda do item: moedas de sabedoria (equipamentos e
   * personagens da história, estes depois da parashá) ou shekels (material e visitantes).
   */
  async buy(userId: string, itemId: string): Promise<ShopState> {
    const item = ITEMS.find((i) => i.id === itemId);
    if (!item) throw Errors.notFound('Item não encontrado.');
    const price = itemPrice(item);
    if (!price) throw Errors.unprocessable('NOT_FOR_SALE', 'Este item é prêmio: ele não está à venda.');
    await this.ensureStarter(this.prisma, userId);
    await this.transaction(async (tx) => {
      if (await tx.userItem.findUnique({ where: { userId_itemId: { userId, itemId } } })) {
        throw Errors.conflict('ALREADY_OWNED', 'Você já tem este item.');
      }
      if (!unlockMet(item, (await this.completedSet(tx, userId)).completed)) {
        throw Errors.conflict('ITEM_LOCKED', 'Este personagem aparece numa parashá que você ainda não estudou.');
      }
      await this.wallet.apply(tx, { userId, currency: price.currency, delta: -price.amount, reason: 'shop', ref: item.id });
      await tx.userItem.create({ data: { userId, itemId } });
    });
    return this.shop(userId);
  }

  async equip(userId: string, itemId: string, equipped: boolean): Promise<ShopState> {
    const item = ITEMS.find((i) => i.id === itemId);
    if (!item) throw Errors.notFound('Item não encontrado.');
    await this.ensureStarter(this.prisma, userId);
    await this.transaction(async (tx) => {
      const row = await tx.userItem.findUnique({ where: { userId_itemId: { userId, itemId } } });
      if (!row) throw Errors.conflict('NOT_OWNED', 'Você ainda não tem este item.');
      if (equipped) {
        const sameSlot = ITEMS.filter((i) => i.slot === item.slot && i.id !== itemId).map((i) => i.id);
        await tx.userItem.updateMany({ where: { userId, itemId: { in: sameSlot } }, data: { equipped: false } });
      }
      await tx.userItem.update({ where: { id: row.id }, data: { equipped } });
    });
    return this.shop(userId);
  }
}

/** Personagem da história: só depois de completar a Torá da parashá onde ele aparece. */
function unlockMet(item: (typeof ITEMS)[number], completed: ReadonlySet<string>): boolean {
  return item.unlock.kind !== 'parasha' || completed.has(parashaNodeId(item.unlock.parashaId));
}

/** Ids vestidos respeitando um item por espaço (na ordem do catálogo). */
function lookOfIds(ids: readonly string[]): string[] {
  const used = new Set<ItemSlot>();
  const out: string[] = [];
  for (const item of ITEMS) {
    if (!ids.includes(item.id) || used.has(item.slot)) continue;
    used.add(item.slot);
    out.push(item.id);
  }
  return out;
}

