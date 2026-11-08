/**
 * Golem World e as novidades da roleta (perguntas de molde, vidas e bots), ponta a
 * ponta, com PostgreSQL de verdade. Os textos vêm de um recorte real do Sefaria
 * (Gênesis 1–2 em JPS 1917, Rashi em Rosenbaum-Silbermann, mishnayot ligadas a
 * Gênesis), todos em domínio público ou CC0.
 */
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@trivia/db';
import { BOT_NAMES, JOURNEY_RULES, LIVES_RULES, SUB_TRACKS } from '@trivia/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK, RANDOM } from '../src/common/infra.js';
import { loadAppConfig } from '../src/config/app-config.js';
import { BotService } from '../src/game/bot.service.js';
import { TranslationService } from '../src/translation/translation.service.js';
import { FakeTranslator, TRANSLATOR } from '../src/translation/translator.js';
import { QuestionSelector } from '../src/game/question-selector.service.js';
import { QuestionFactory } from '../src/questions/question-factory.service.js';
import { configureApp } from '../src/security/http-hardening.js';

const url = process.env.TEST_DATABASE_URL;

const clock = {
  current: new Date('2026-11-01T12:00:00Z'),
  now() {
    return new Date(this.current);
  },
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  },
};

/** Sorteio que vai variando (as perguntas de molde precisam de variedade). */
const rng = {
  counter: 7,
  int(max: number) {
    this.counter = (this.counter * 1103515245 + 12345) % 2147483648;
    return this.counter % max;
  },
};

interface FixtureRow {
  ref: string;
  track: 'torah' | 'commentators' | 'mishnah';
  bookTitle: string;
  author: string | null;
  sequence: number;
  heText: string | null;
  heVersionTitle: string | null;
  heLicense: string | null;
  enText: string | null;
  enVersionTitle: string | null;
  enLicense: string | null;
  anchors: string[];
  parashot: string[];
  wordCount: number;
}

describe.skipIf(!url)('Golem World e roleta dinâmica (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let http: ReturnType<typeof request>;
  let bots: BotService;
  let translations: TranslationService;
  let translator: FakeTranslator;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  /** Os textos do recorte estão em inglês e hebraico: por padrão, joga-se em inglês. */
  async function guest(name: string, locale: 'pt' | 'en' | 'he' = 'en') {
    const res = await http.post('/auth/guest').send({ displayName: name, locale }).expect(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  }

  /** Posição na tela da alternativa certa (o teste lê o gabarito direto do banco). */
  async function correctPosition(answerId: string): Promise<number> {
    const a = await prisma.journeyAnswer.findUniqueOrThrow({ where: { id: answerId }, include: { question: true } });
    return a.optionOrder.indexOf(a.question.correctIndex);
  }

  async function playNode(token: string, nodeId: string, mistakes = 0) {
    const run = await http.post('/journey/runs').set(auth(token)).send({ nodeId }).expect(201);
    let last: request.Response | null = null;
    let wrongLeft = mistakes;
    for (let i = 0; i < 40; i++) {
      const q = await http.post(`/journey/runs/${run.body.runId}/question`).set(auth(token)).expect(200);
      const right = await correctPosition(q.body.answerId);
      const option = wrongLeft > 0 ? (right + 1) % 4 : right;
      if (wrongLeft > 0) wrongLeft--;
      last = await http.post(`/journey/runs/${run.body.runId}/answer`).set(auth(token)).send({ answerId: q.body.answerId, optionIndex: option }).expect(200);
      if (last.body.run.status !== 'active') break;
    }
    return { run: run.body, last: last!.body };
  }

  beforeAll(async () => {
    prisma = createPrismaClient({ databaseUrl: url! });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "JourneyAnswer", "JourneyRun", "JourneyProgress", "UserItem", "QuestionReport", "QuestionPlay", "Spin", "Turn", "GamePlayer", "Game", "RefreshToken", "QuestionReview", "Question", "GenerationBatch", "SourcePassage", "StudyText", "User" CASCADE',
    );
    const rows = JSON.parse(readFileSync(new URL('./fixtures/journey-bereshit.json', import.meta.url), 'utf8')) as FixtureRow[];
    await prisma.studyText.createMany({ data: rows.map((r) => ({ ...r, contentHash: 'f'.repeat(64) })) });

    const config = loadAppConfig({
      DATABASE_URL: url!,
      JWT_ACCESS_SECRET: 'segredo-de-acesso-para-testes-com-32-chars',
      JWT_REFRESH_SECRET: 'segredo-de-refresh-para-testes-com-32-chars',
      NODE_ENV: 'test',
      RATE_LIMIT_ENABLED: 'false',
      MAINTENANCE_ENABLED: 'false',
      BOTS_ENABLED: 'false',
      TRANSLATION_PROVIDER: 'fake',
      TRANSLATION_WARMER: 'false',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .overrideProvider(RANDOM)
      .useValue(rng)
      .compile();
    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false }), config);
    await app.init();
    http = request(app.getHttpServer());
    bots = app.get(BotService);
    translations = app.get(TranslationService);
    translator = app.get(TRANSLATOR);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  describe('mapa', () => {
    it('começa com a Torá de Bereshit aberta e os subcaminhos fechados', async () => {
      const g = await guest('Golem Novato');
      const res = await http.get('/journey').set(auth(g.token)).expect(200);
      const bereshit = res.body.worlds[0].parashot[0];
      expect(bereshit.main).toMatchObject({ nodeId: 'bereshit:torah', state: 'open', available: true, stars: 0 });
      expect(bereshit.tracks.map((t: { state: string }) => t.state)).toEqual(SUB_TRACKS.map(() => 'locked'));
      expect(bereshit.tracks.find((t: { track: string }) => t.track === 'commentators').available).toBe(true);
      expect(res.body.worlds[0].parashot[1].main).toMatchObject({ state: 'locked', available: false });
      expect(res.body.golem.equipped).toEqual({ head: 'kipa-azul' });
      expect(res.body.currentNodeId).toBe('bereshit:torah');
    });

    it('não deixa entrar num subcaminho antes da Torá da parashá', async () => {
      const g = await guest('Golem Apressado');
      const res = await http.post('/journey/runs').set(auth(g.token)).send({ nodeId: 'bereshit:commentators' }).expect(409);
      expect(res.body.code).toBe('NODE_LOCKED');
      expect(res.body.message).toMatch(/depois que você completa a Torá/);
      await http.post('/journey/runs').set(auth(g.token)).send({ nodeId: 'noach:torah' }).expect(409);
      await http.post('/journey/runs').set(auth(g.token)).send({ nodeId: 'bereshit:astrologia' }).expect(422);
    });
  });

  describe('uma fase da Torá', () => {
    it('a pergunta chega sem gabarito e com o trecho do versículo', async () => {
      const g = await guest('Golem Curioso');
      const run = await http.post('/journey/runs').set(auth(g.token)).send({ nodeId: 'bereshit:torah' }).expect(201);
      expect(run.body).toMatchObject({ hearts: JOURNEY_RULES.hearts, obstacleCount: JOURNEY_RULES.obstacles.main, obstacleIndex: 0, status: 'active' });
      const q = await http.post(`/journey/runs/${run.body.runId}/question`).set(auth(g.token)).expect(200);
      expect(q.body.options).toHaveLength(4);
      expect(q.body.track).toBe('torah');
      for (const forbidden of ['correctIndex', 'correctOptionIndex', 'sourceRef', 'explanation', 'evidenceQuote']) expect(q.body).not.toHaveProperty(forbidden);
      // Pedir de novo devolve a mesma pergunta aberta (o app pode recarregar).
      const again = await http.post(`/journey/runs/${run.body.runId}/question`).set(auth(g.token)).expect(200);
      expect(again.body.answerId).toBe(q.body.answerId);
      const question = await prisma.journeyAnswer.findUniqueOrThrow({ where: { id: q.body.answerId }, include: { question: true } });
      expect(question.question).toMatchObject({ origin: 'template', status: 'approved', track: 'torah', parashot: ['bereshit'] });
      expect(question.question.studyTextId).not.toBeNull();
    });

    it('concluir sem errar dá 3 estrelas, moedas e abre Nôach e os subcaminhos', async () => {
      const g = await guest('Golem Estudioso');
      const { last } = await playNode(g.token, 'bereshit:torah');
      expect(last.run.status).toBe('completed');
      expect(last.completion).toMatchObject({ stars: 3, firstTime: true });
      expect(last.completion.opened).toEqual(expect.arrayContaining(['noach:torah', ...SUB_TRACKS.map((t) => `bereshit:${t}`)]));
      expect(last.source.url).toMatch(/^https:\/\/www\.sefaria\.org\//);
      const me = await http.get('/me').set(auth(g.token)).expect(200);
      expect(me.body.coins).toBeGreaterThan(30);
      // As moedas do Golem World não contam para o ranking da roleta.
      expect(me.body.totalPoints).toBe(0);
      const map = await http.get('/journey').set(auth(g.token)).expect(200);
      const bereshit = map.body.worlds[0].parashot[0];
      expect(bereshit.main).toMatchObject({ state: 'completed', stars: 3 });
      expect(bereshit.tracks.every((t: { state: string }) => t.state === 'open')).toBe(true);
    });

    it('acertos rápidos sobem o nível das próximas perguntas', async () => {
      const g = await guest('Golem Veloz');
      const run = await http.post('/journey/runs').set(auth(g.token)).send({ nodeId: 'bereshit:torah' }).expect(201);
      expect(run.body.level).toBe('medium');
      let level = run.body.level;
      for (let i = 0; i < 2; i++) {
        const q = await http.post(`/journey/runs/${run.body.runId}/question`).set(auth(g.token)).expect(200);
        clock.advance(2000);
        const res = await http
          .post(`/journey/runs/${run.body.runId}/answer`)
          .set(auth(g.token))
          .send({ answerId: q.body.answerId, optionIndex: await correctPosition(q.body.answerId) })
          .expect(200);
        expect(res.body.outcome).toBe('perfect');
        level = res.body.nextLevel;
      }
      expect(level).toBe('hard');
    });

    it('errar custa coração; sem corações a fase acaba', async () => {
      const g = await guest('Golem Distraído');
      const { last } = await playNode(g.token, 'bereshit:torah', 3);
      expect(last.run).toMatchObject({ status: 'failed', hearts: 0 });
      expect(last.outcome).toBe('wrong');
      expect(last.completion).toBeNull();
    });

    it('o tempo esgotado conta como erro', async () => {
      const g = await guest('Golem Lento');
      const run = await http.post('/journey/runs').set(auth(g.token)).send({ nodeId: 'bereshit:torah' }).expect(201);
      const q = await http.post(`/journey/runs/${run.body.runId}/question`).set(auth(g.token)).expect(200);
      clock.advance((JOURNEY_RULES.questionTimeLimitSeconds + JOURNEY_RULES.networkGraceSeconds + 1) * 1000);
      const res = await http
        .post(`/journey/runs/${run.body.runId}/answer`)
        .set(auth(g.token))
        .send({ answerId: q.body.answerId, optionIndex: await correctPosition(q.body.answerId) })
        .expect(200);
      expect(res.body).toMatchObject({ outcome: 'timeout', timedOut: true, passed: false });
      expect(res.body.run.hearts).toBe(JOURNEY_RULES.hearts - 1);
    });
  });

  describe('subcaminhos', () => {
    it('comentaristas e Mishná trazem o trecho estudado e perguntam pelo versículo', async () => {
      const g = await guest('Golem Explorador');
      await playNode(g.token, 'bereshit:torah');
      for (const nodeId of ['bereshit:commentators', 'bereshit:mishnah']) {
        const run = await http.post('/journey/runs').set(auth(g.token)).send({ nodeId }).expect(201);
        expect(run.body.obstacleCount).toBe(JOURNEY_RULES.obstacles.track);
        const q = await http.post(`/journey/runs/${run.body.runId}/question`).set(auth(g.token)).expect(200);
        expect(q.body.context?.text.length).toBeGreaterThan(10);
        const stored = await prisma.journeyAnswer.findUniqueOrThrow({ where: { id: q.body.answerId }, include: { question: true } });
        expect(stored.question.template).toMatch(/comment-verse|comment-author|source-verse|which-book/);
        await http.post(`/journey/runs/${run.body.runId}/abandon`).set(auth(g.token)).expect(200);
      }
      // Trilhas sem textos não abrem.
      const res = await http.post('/journey/runs').set(auth(g.token)).send({ nodeId: 'bereshit:kabbalah' }).expect(422);
      expect(res.body.code).toBe('NO_QUESTIONS');
    });
  });

  describe('armário e poderes', () => {
    it('compra com moedas, recusa prêmio e saldo insuficiente', async () => {
      const g = await guest('Golem Comprador');
      const broke = await http.post('/journey/shop/buy').set(auth(g.token)).send({ itemId: 'oculos' }).expect(409);
      expect(broke.body.code).toBe('NOT_ENOUGH_COINS');
      const prize = await http.post('/journey/shop/buy').set(auth(g.token)).send({ itemId: 'tzitzit' }).expect(422);
      expect(prize.body.code).toBe('NOT_FOR_SALE');
      await prisma.user.update({ where: { id: g.id }, data: { coins: 500 } });
      const bought = await http.post('/journey/shop/buy').set(auth(g.token)).send({ itemId: 'oculos' }).expect(200);
      expect(bought.body.coins).toBe(380);
      await http.post('/journey/shop/buy').set(auth(g.token)).send({ itemId: 'oculos' }).expect(409);
      await http.post('/journey/shop/buy').set(auth(g.token)).send({ itemId: 'sacola' }).expect(200);
      await http.post('/journey/shop/equip').set(auth(g.token)).send({ itemId: 'oculos', equipped: true }).expect(200);
      const shop = await http.post('/journey/shop/equip').set(auth(g.token)).send({ itemId: 'sacola', equipped: true }).expect(200);
      expect(shop.body.golem.equipped).toEqual({ head: 'kipa-azul', face: 'oculos', body: 'sacola' });
    });

    it('óculos eliminam duas alternativas erradas; a sacola pula a pergunta', async () => {
      const g = await guest('Golem Equipado');
      await prisma.user.update({ where: { id: g.id }, data: { coins: 500 } });
      for (const itemId of ['oculos', 'sacola']) {
        await http.post('/journey/shop/buy').set(auth(g.token)).send({ itemId }).expect(200);
        await http.post('/journey/shop/equip').set(auth(g.token)).send({ itemId, equipped: true }).expect(200);
      }
      const run = await http.post('/journey/runs').set(auth(g.token)).send({ nodeId: 'bereshit:torah' }).expect(201);
      expect(run.body.powerUps).toEqual({ eliminate: 1, skip: 1, hint: 0 });
      const q = await http.post(`/journey/runs/${run.body.runId}/question`).set(auth(g.token)).expect(200);
      const right = await correctPosition(q.body.answerId);
      const elim = await http.post(`/journey/runs/${run.body.runId}/power`).set(auth(g.token)).send({ answerId: q.body.answerId, kind: 'eliminate' }).expect(200);
      expect(elim.body.eliminated).toHaveLength(2);
      expect(elim.body.eliminated).not.toContain(right);
      const blocked = await http
        .post(`/journey/runs/${run.body.runId}/answer`)
        .set(auth(g.token))
        .send({ answerId: q.body.answerId, optionIndex: elim.body.eliminated[0] })
        .expect(422);
      expect(blocked.body.code).toBe('OPTION_ELIMINATED');
      await http.post(`/journey/runs/${run.body.runId}/power`).set(auth(g.token)).send({ answerId: q.body.answerId, kind: 'eliminate' }).expect(409);
      const skip = await http.post(`/journey/runs/${run.body.runId}/power`).set(auth(g.token)).send({ answerId: q.body.answerId, kind: 'skip' }).expect(200);
      expect(skip.body.answer).toMatchObject({ outcome: 'skipped', passed: true, coinsAwarded: 0 });
      expect(skip.body.run).toMatchObject({ obstacleIndex: 1, hearts: JOURNEY_RULES.hearts, powerUps: { skip: 0 } });
    });

    it('a casa de estudos dá o talit catan, que soma um coração', async () => {
      const g = await guest('Golem Formado');
      const mains = (await import('@trivia/shared')).parashotOfBook('Genesis').map((p) => ({ userId: g.id, nodeId: `${p.id}:torah`, bestStars: 3 }));
      await prisma.journeyProgress.createMany({ data: mains });
      const { last } = await playNode(g.token, 'beit-midrash:Genesis');
      expect(last.run.status).toBe('completed');
      expect(last.completion.rewards).toContain('tzitzit');
      expect(last.completion.opened).toContain('shemot:torah');
      await http.post('/journey/shop/equip').set(auth(g.token)).send({ itemId: 'tzitzit', equipped: true }).expect(200);
      const run = await http.post('/journey/runs').set(auth(g.token)).send({ nodeId: 'bereshit:torah' }).expect(201);
      expect(run.body.hearts).toBe(JOURNEY_RULES.hearts + 1);
    });
  });

  describe('roleta', () => {
    it('monta perguntas na hora a partir dos textos (sem perguntas do motor no banco)', async () => {
      const g = await guest('Jogador Solo');
      const game = await http.post('/games').set(auth(g.token)).send({ mode: 'solo' }).expect(201);
      const spin = await http.post(`/games/${game.body.id}/spin`).set(auth(g.token)).expect(200);
      expect(['torah', 'mishnah', 'crown']).toContain(spin.body.result);
      const q =
        spin.body.result === 'crown'
          ? await http.post(`/games/${game.body.id}/crown`).set(auth(g.token)).send({ category: 'torah' })
          : await http.post(`/games/${game.body.id}/question`).set(auth(g.token)).send({ spinId: spin.body.spinId });
      expect([200, 201]).toContain(q.status);
      expect(q.body.options).toHaveLength(4);
      expect(q.body.context).not.toBeNull();
    });

    it('cada erro gasta uma vida; sem vidas não gira; uma volta em 10 minutos', async () => {
      const g = await guest('Jogador Azarado');
      const game = await http.post('/games').set(auth(g.token)).send({ mode: 'solo' }).expect(201);
      let lives = LIVES_RULES.max;
      for (let i = 0; i < 20 && lives > 0; i++) {
        const spin = await http.post(`/games/${game.body.id}/spin`).set(auth(g.token)).expect(200);
        const q =
          spin.body.result === 'crown'
            ? await http.post(`/games/${game.body.id}/crown`).set(auth(g.token)).send({ category: 'torah' })
            : await http.post(`/games/${game.body.id}/question`).set(auth(g.token)).send({ spinId: spin.body.spinId });
        const play = await prisma.questionPlay.findUniqueOrThrow({ where: { id: q.body.playId }, include: { question: true } });
        const wrong = (play.optionOrder.indexOf(play.question.correctIndex) + 1) % 4;
        const res = await http.post(`/games/${game.body.id}/answer`).set(auth(g.token)).send({ playId: q.body.playId, optionIndex: wrong }).expect(200);
        lives = res.body.lives.lives;
      }
      expect(lives).toBe(0);
      const blocked = await http.post(`/games/${game.body.id}/spin`).set(auth(g.token)).expect(409);
      expect(blocked.body.code).toBe('NO_LIVES');
      const state = await http.get(`/games/${game.body.id}`).set(auth(g.token)).expect(200);
      expect(state.body.lives).toMatchObject({ lives: 0, max: LIVES_RULES.max });
      expect(state.body.lives.nextLifeAt).not.toBeNull();
      clock.advance(LIVES_RULES.regenMinutes * 60_000);
      await http.post(`/games/${game.body.id}/spin`).set(auth(g.token)).expect(200);
    });

    it('sem ninguém na fila, um bot entra, joga a vez e fica fora do ranking', async () => {
      const g = await guest('Jogador Sozinho');
      const game = await http.post('/games').set(auth(g.token)).send({ mode: 'random' }).expect(201);
      expect(game.body.phase).toBe('waiting_opponent');
      clock.advance(3000);
      expect((await bots.tick()).joined).toBe(0);
      clock.advance(6000);
      expect((await bots.tick()).joined).toBe(1);
      const state = await http.get(`/games/${game.body.id}`).set(auth(g.token)).expect(200);
      expect(state.body.opponent).toMatchObject({ isBot: true });
      expect(BOT_NAMES).toContain(state.body.opponent.displayName);
      expect(state.body.phase).toBe('spin');

      // O humano erra de propósito: a vez passa para o bot.
      for (let i = 0; i < 10; i++) {
        const now = await http.get(`/games/${game.body.id}`).set(auth(g.token)).expect(200);
        if (now.body.phase !== 'spin') break;
        const spin = await http.post(`/games/${game.body.id}/spin`).set(auth(g.token)).expect(200);
        const q =
          spin.body.result === 'crown'
            ? await http.post(`/games/${game.body.id}/crown`).set(auth(g.token)).send({ category: 'torah' })
            : await http.post(`/games/${game.body.id}/question`).set(auth(g.token)).send({ spinId: spin.body.spinId });
        const play = await prisma.questionPlay.findUniqueOrThrow({ where: { id: q.body.playId }, include: { question: true } });
        const wrong = (play.optionOrder.indexOf(play.question.correctIndex) + 1) % 4;
        await http.post(`/games/${game.body.id}/answer`).set(auth(g.token)).send({ playId: q.body.playId, optionIndex: wrong }).expect(200);
      }
      const waiting = await http.get(`/games/${game.body.id}`).set(auth(g.token)).expect(200);
      expect(waiting.body.phase).toBe('opponent_turn');
      clock.advance(1000);
      expect((await bots.tick()).turns).toBe(0); // ainda "pensando"
      clock.advance(10_000);
      expect((await bots.tick()).turns).toBe(1);
      const after = await http.get(`/games/${game.body.id}`).set(auth(g.token)).expect(200);
      expect(after.body.phase === 'spin' || after.body.status === 'finished').toBe(true);
      const botPlays = await prisma.questionPlay.count({ where: { user: { isBot: true }, turn: { gameId: game.body.id } } });
      expect(botPlays).toBeGreaterThan(0);

      const ranking = await http.get('/ranking?period=all').set(auth(g.token)).expect(200);
      const names = ranking.body.entries.map((e: { displayName: string }) => e.displayName);
      for (const name of BOT_NAMES) expect(names).not.toContain(name);
    });
  });

  describe('idiomas (Fase 8)', () => {
    async function prepareUntilReady(token: string, path: string, body: object) {
      let res = await http.post(path).set(auth(token)).send(body).expect(200);
      for (let i = 0; i < 50 && res.body.status === 'preparing'; i++) {
        await translations.settle();
        res = await http.post(path).set(auth(token)).send(body).expect(200);
      }
      return res.body as { status: string; done: number; total: number };
    }

    it('o jogador escolhe o idioma, que fica na conta', async () => {
      const g = await guest('Poliglota', 'pt');
      expect((await http.get('/me').set(auth(g.token)).expect(200)).body.locale).toBe('pt');
      const res = await http.patch('/me').set(auth(g.token)).send({ locale: 'he' }).expect(200);
      expect(res.body.locale).toBe('he');
      await http.patch('/me').set(auth(g.token)).send({ locale: 'xx' }).expect(400);
    });

    it('em hebraico não há preparo: a fase sai no original, com os Nomes grafados com reverência', async () => {
      const g = await guest('Golem Hebraico', 'he');
      const prep = await http.post('/journey/prepare').set(auth(g.token)).send({ nodeId: 'bereshit:torah' }).expect(200);
      expect(prep.body).toEqual({ status: 'ready', done: 0, total: 0 });
      const run = await http.post('/journey/runs').set(auth(g.token)).send({ nodeId: 'bereshit:torah' }).expect(201);
      const q = await http.post(`/journey/runs/${run.body.runId}/question`).set(auth(g.token)).expect(200);
      expect(q.body.text).toMatch(/[א-ת]/);
      expect(q.body.options.join(' ')).toMatch(/[א-ת]/);
      expect(q.body.options.join(' ')).not.toMatch(/[A-Za-z]/);
      expect(JSON.stringify(q.body)).not.toMatch(/יהוה/);
    });

    it('em português, a fase é traduzida uma vez na tela de preparo e depois sai inteira em português', async () => {
      const before = translator.calls;
      const g = await guest('Golem Brasileiro', 'pt');
      const first = await http.post('/journey/prepare').set(auth(g.token)).send({ nodeId: 'bereshit:torah' }).expect(200);
      expect(first.body.status).toBe('preparing');
      expect(first.body.total).toBeGreaterThan(10);
      const done = await prepareUntilReady(g.token, '/journey/prepare', { nodeId: 'bereshit:torah' });
      expect(done.status).toBe('ready');
      expect(translator.calls).toBeGreaterThan(before);
      expect(await prisma.segmentTranslation.count({ where: { locale: 'pt' } })).toBeGreaterThan(10);

      const { last } = await playNode(g.token, 'bereshit:torah');
      expect(last.run.status).toBe('completed');
      expect(last.source.language).toBe('pt');
      expect(last.source.machineTranslated).toBe(true);
      expect(last.explanation).not.toMatch(/[א-ת]/);
      const stored = await prisma.question.findMany({ where: { journeyAnswers: { some: { userId: g.id } } } });
      for (const q of stored) {
        expect(q.locale).toBe('pt');
        expect([q.text, ...q.options].join(' ')).not.toMatch(/[א-ת]/);
      }

      // Outro jogador em português: nada a traduzir de novo.
      const calls = translator.calls;
      const g2 = await guest('Golem Paulista', 'pt');
      const again = await http.post('/journey/prepare').set(auth(g2.token)).send({ nodeId: 'bereshit:torah' }).expect(200);
      expect(again.body.status).toBe('ready');
      expect(translator.calls).toBe(calls);
    });

    it('a tradução reprovada nas checagens não vai para o banco', async () => {
      const verse = await prisma.studyText.findFirstOrThrow({ where: { track: 'torah', ref: 'Genesis 2:1' } });
      await prisma.segmentTranslation.deleteMany({ where: { studyTextId: verse.id } });
      const original = translator.translateSegments.bind(translator);
      translator.translateSegments = async (target, items) => items.map((i) => ({ id: i.id, text: i.he ?? '' }));
      try {
        const r = await translations.ensureSegments([verse.id], 'pt');
        expect(r).toMatchObject({ translated: 0, failed: 1 });
        expect(await prisma.segmentTranslation.count({ where: { studyTextId: verse.id } })).toBe(0);
      } finally {
        translator.translateSegments = original;
      }
      const ok = await translations.ensureSegments([verse.id], 'pt');
      expect(ok.translated).toBe(1);
    });

    it('a tradução fica velha se o Sefaria mudar o texto, e é refeita', async () => {
      const verse = await prisma.studyText.findFirstOrThrow({ where: { track: 'torah', ref: 'Genesis 1:1' } });
      await translations.ensureSegments([verse.id], 'pt');
      expect(await translations.missingSegments([verse.id], 'pt')).toEqual([]);
      await prisma.studyText.update({ where: { id: verse.id }, data: { contentHash: 'e'.repeat(64) } });
      expect(await translations.missingSegments([verse.id], 'pt')).toEqual([verse.id]);
      await translations.ensureSegments([verse.id], 'pt');
      expect(await translations.missingSegments([verse.id], 'pt')).toEqual([]);
    });

    it('com a tradução desligada, a fase sem texto no idioma fica indisponível (e nunca mistura)', async () => {
      const g = await guest('Golem Sem Tradutor', 'pt');
      await prisma.segmentTranslation.deleteMany({});
      app.get(QuestionFactory).invalidate();
      const enabled = Object.getOwnPropertyDescriptor(translator, 'enabled');
      Object.defineProperty(translator, 'enabled', { value: false, configurable: true });
      try {
        const res = await http.post('/journey/prepare').set(auth(g.token)).send({ nodeId: 'bereshit:torah' }).expect(200);
        expect(res.body.status).toBe('unavailable');
      } finally {
        if (enabled) Object.defineProperty(translator, 'enabled', enabled);
      }
    });

    it('roleta em inglês: as perguntas do motor (escritas em português) chegam traduzidas', async () => {
      const verse = await prisma.studyText.findFirstOrThrow({ where: { ref: 'Genesis 1:16' } });
      await prisma.question.create({
        data: {
          studyTextId: verse.id,
          category: 'halakhah',
          origin: 'llm',
          locale: 'pt',
          text: 'Em que dia da Criação foram feitos o sol e a lua?',
          options: ['No primeiro dia', 'No quarto dia', 'No sexto dia', 'No segundo dia'],
          correctIndex: 1,
          explanation: 'Os luminares foram feitos no quarto dia.',
          sourceRef: 'Genesis 1:16',
          evidenceQuote: 'And God made the two great lights',
          evidenceLanguage: 'en',
          aiDifficulty: 'easy',
          difficulty: 'easy',
          status: 'approved',
          dedupeKey: 'c'.repeat(64),
        },
      });
      app.get(QuestionSelector).invalidateAvailability();
      const g = await guest('Golem Americano', 'en');
      const prep = await prepareUntilReady(g.token, '/games/prepare', {});
      expect(prep.status).toBe('ready');
      const tr = await prisma.questionTranslation.findFirstOrThrow({ where: { locale: 'en' } });
      expect(tr.text.startsWith('[en] ')).toBe(true);
      expect(tr.options).toHaveLength(4);
      const categories = await app.get(QuestionSelector).availableCategories('en');
      expect(categories).toContain('halakhah');
      // Em português (o idioma em que foi escrita), a pergunta não precisa de tradução.
      expect(await app.get(QuestionSelector).availableCategories('pt')).toContain('halakhah');
    });
  });
});
