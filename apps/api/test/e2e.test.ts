/**
 * Testes ponta a ponta da API com PostgreSQL de verdade, relógio e sorteio controlados.
 * Rodam quando TEST_DATABASE_URL aponta para um banco de teste já migrado
 * (ATENÇÃO: as tabelas desse banco são apagadas).
 */
import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@trivia/db';
import { GAME_RULES, type CategoryId } from '@trivia/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK, RANDOM } from '../src/common/infra.js';
import { createStaff } from '../src/cli/accounts-admin.js';
import { loadAppConfig } from '../src/config/app-config.js';
import { configureApp } from '../src/security/http-hardening.js';
import { QuestionSelector } from '../src/game/question-selector.service.js';
import { localizeQuestion } from '../src/questions/localized.js';
import { questionSourceHash } from '../src/translation/translation.service.js';

const url = process.env.TEST_DATABASE_URL;

/** Relógio que só anda quando o teste manda. */
const clock = {
  current: new Date('2026-10-28T15:00:00Z'),
  now() {
    return new Date(this.current);
  },
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  },
};

/** Sorteio previsível: "first" escolhe o primeiro item, "last" o último, "cycle" vai variando. */
const rng = {
  mode: 'first' as 'first' | 'last' | 'cycle',
  counter: 0,
  int(max: number) {
    if (this.mode === 'cycle') return this.counter++ % max;
    return this.mode === 'first' ? 0 : max - 1;
  },
};

describe.skipIf(!url)('API (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let http: ReturnType<typeof request>;
  let passageId: string;

  async function guest(name: string) {
    const res = await http.post('/auth/guest').send({ displayName: name }).expect(201);
    return { token: res.body.accessToken as string, refresh: res.body.refreshToken as string, id: res.body.user.id as string };
  }
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function addQuestion(category: CategoryId, n: number, status: 'approved' | 'pending_review' = 'approved') {
    return prisma.question.create({
      data: {
        passageId,
        category,
        text: `Pergunta ${category} ${n}?`,
        options: [`Certa ${n}`, `Errada A ${n}`, `Errada B ${n}`, `Errada C ${n}`],
        correctIndex: 0,
        explanation: 'Explicação de teste com base no trecho.',
        sourceRef: 'Genesis 1:3',
        evidenceQuote: 'Let there be light',
        evidenceLanguage: 'en',
        aiDifficulty: 'easy',
        difficulty: 'easy',
        status,
        dedupeKey: `${category}-${n}-${status}`.padEnd(64, '0'),
      },
    });
  }

  /** Posição na tela da alternativa correta (ou de uma errada) da pergunta aberta. */
  async function optionFor(playId: string, correct: boolean): Promise<number> {
    const play = await prisma.questionPlay.findUniqueOrThrow({ where: { id: playId }, include: { question: true } });
    const right = play.optionOrder.indexOf(play.question.correctIndex);
    return correct ? right : (right + 1) % 4;
  }

  async function spinAndAsk(token: string, gameId: string) {
    const spin = await http.post(`/games/${gameId}/spin`).set(auth(token)).expect(200);
    expect(spin.body.result).not.toBe('crown');
    const q = await http.post(`/games/${gameId}/question`).set(auth(token)).send({ spinId: spin.body.spinId }).expect(200);
    return q.body as { playId: string; isCrownChallenge: boolean; options: string[]; category: CategoryId };
  }

  async function answer(token: string, gameId: string, playId: string, correct: boolean) {
    const res = await http
      .post(`/games/${gameId}/answer`)
      .set(auth(token))
      .send({ playId, optionIndex: await optionFor(playId, correct) })
      .expect(200);
    return res.body;
  }

  beforeAll(async () => {
    prisma = createPrismaClient({ databaseUrl: url! });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "JourneyAnswer", "JourneyRun", "JourneyProgress", "UserItem", "StudyText", "QuestionReport", "QuestionPlay", "Spin", "Turn", "GamePlayer", "Game", "RefreshToken", "QuestionReview", "Question", "GenerationBatch", "SourcePassage", "User" CASCADE',
    );
    const passage = await prisma.sourcePassage.create({
      data: {
        ref: 'Genesis 1:1-5',
        category: 'torah',
        bookTitle: 'Genesis',
        sefariaPath: ['Tanakh', 'Torah'],
        enText: 'And God said: Let there be light. And there was light.',
        enVersionTitle: 'The Holy Scriptures: A New Translation (JPS 1917)',
        enLicense: 'Public Domain',
        heText: 'וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר וַיְהִי אוֹר',
        heVersionTitle: "Tanach with Ta'amei Hamikra",
        heLicense: 'Public Domain',
        segments: [{ ref: 'Genesis 1:3', en: 'And God said: Let there be light. And there was light.' }],
        contentHash: 'x'.repeat(64),
        wordCount: 12,
      },
    });
    passageId = passage.id;
    for (let i = 0; i < 12; i++) await addQuestion('torah', i);
    for (let i = 0; i < 4; i++) await addQuestion('talmud', i);
    for (let i = 0; i < 3; i++) await addQuestion('mishnah', i, 'pending_review');

    const config = loadAppConfig({
      DATABASE_URL: url!,
      JWT_ACCESS_SECRET: 'segredo-de-acesso-para-testes-com-32-chars',
      JWT_REFRESH_SECRET: 'segredo-de-refresh-para-testes-com-32-chars',
      NODE_ENV: 'test',
      // Os limites de requisição têm testes próprios (security.e2e.test.ts).
      RATE_LIMIT_ENABLED: 'false',
      MAINTENANCE_ENABLED: 'false',
      BOTS_ENABLED: 'false',
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
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('banco de perguntas (Fase 12): cai no sevivon e chega no idioma do jogador com a citação e a versão de cada idioma', async () => {
    const data = {
      category: 'halakhah' as const,
      origin: 'bank' as const,
      locale: 'pt',
      text: 'Quantos níveis de tsedacá o Rambam enumera?',
      options: ['Oito', 'Sete', 'Dez', 'Três'],
      correctIndex: 0,
      explanation: 'Há oito níveis na tsedacá.',
      sourceRef: 'Mishneh Torah, Gifts to the Poor 10:7',
      evidenceQuote: 'שמונה מעלות יש בצדקה',
      evidenceLanguage: 'he',
      versionTitle: 'Torat Emet 363',
      license: 'Public Domain',
      aiDifficulty: 'easy' as const,
      difficulty: 'easy' as const,
      status: 'approved' as const,
      dedupeKey: 'bank-test'.padEnd(64, '0'),
    };
    const q = await prisma.question.create({ data });
    const hash = questionSourceHash(q);
    const tr = { sourceHash: hash, provider: 'bank', model: 'bank-1', promptVersion: 'bank-1', status: 'bank' };
    await prisma.questionTranslation.create({
      data: {
        questionId: q.id,
        locale: 'en',
        text: 'How many levels of tzedakah does the Rambam list?',
        options: ['Eight', 'Seven', 'Ten', 'Three'],
        explanation: 'There are eight levels of charity.',
        evidenceQuote: 'There are eight levels of charity',
        evidenceLanguage: 'en',
        versionTitle: 'Sefaria Community Translation',
        license: 'CC0',
        ...tr,
      },
    });
    await prisma.questionTranslation.create({
      data: { questionId: q.id, locale: 'he', text: 'כמה מעלות בצדקה מונה הרמב״ם?', options: ['שמונה', 'שבע', 'עשר', 'שלוש'], explanation: 'שמונה מעלות יש בצדקה.', evidenceQuote: 'שמונה מעלות יש בצדקה', evidenceLanguage: 'he', ...tr },
    });
    const selector = app.get(QuestionSelector);
    selector.invalidateAvailability();
    for (const locale of ['pt', 'en', 'he'] as const) expect(await selector.availableCategories(locale)).toContain('halakhah');
    const g = await guest('Leitor do Banco');
    const picked = await selector.pick(prisma, { userId: g.id, category: 'halakhah', isCrownChallenge: false, locale: 'en' });
    expect(picked.id).toBe(q.id);
    const en = await localizeQuestion(prisma, picked, 'en');
    expect(en).toMatchObject({ text: 'How many levels of tzedakah does the Rambam list?', evidenceLanguage: 'en', machineTranslated: false, version: { title: 'Sefaria Community Translation', license: 'CC0' } });
    const he = await localizeQuestion(prisma, picked, 'he');
    // Sem versão própria na tradução, vale a da pergunta (o mesmo original hebraico).
    expect(he).toMatchObject({ evidenceLanguage: 'he', machineTranslated: false });
    expect(he.version).toBeUndefined();
    await prisma.question.delete({ where: { id: q.id } });
    selector.invalidateAvailability();
  });

  it('responde ao health check', async () => {
    await http.get('/health').expect(200, { ok: true });
  });

  describe('autenticação', () => {
    it('convidado acessa /me; sem token, 401', async () => {
      const g = await guest('Visitante Teste');
      const me = await http.get('/me').set(auth(g.token)).expect(200);
      expect(me.body).toMatchObject({ id: g.id, isGuest: true, displayName: 'Visitante Teste', stats: { gamesPlayed: 0 } });
      const denied = await http.get('/me').expect(401);
      expect(denied.body.code).toBe('UNAUTHORIZED');
    });

    it('cadastro a partir de convidado mantém a mesma conta', async () => {
      const g = await guest('Futuro Cadastrado');
      const reg = await http
        .post('/auth/register')
        .set(auth(g.token))
        .send({ email: 'Aluno@Exemplo.com', password: 'cedro-do-libano-7', displayName: 'Aluno' })
        .expect(201);
      expect(reg.body.user).toMatchObject({ id: g.id, isGuest: false, displayName: 'Aluno' });
      const dup = await http.post('/auth/register').send({ email: 'aluno@exemplo.com', password: 'outra-senha-boa-9', displayName: 'Outro' }).expect(409);
      expect(dup.body.code).toBe('EMAIL_TAKEN');
    });

    it('login confere a senha', async () => {
      await http.post('/auth/login').send({ email: 'aluno@exemplo.com', password: 'errada' }).expect(401);
      const ok = await http.post('/auth/login').send({ email: 'ALUNO@exemplo.com', password: 'cedro-do-libano-7' }).expect(200);
      expect(ok.body.user.displayName).toBe('Aluno');
    });

    it('refresh gira o token e reutilizar um token antigo encerra todas as sessões', async () => {
      const g = await guest('Sessões');
      const r1 = await http.post('/auth/refresh').send({ refreshToken: g.refresh }).expect(200);
      clock.advance(61_000); // passada a tolerância de reuso
      await http.post('/auth/refresh').send({ refreshToken: g.refresh }).expect(401); // reuso
      await http.post('/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401); // tudo revogado
      await http.get('/me').set(auth(r1.body.accessToken)).expect(401); // inclusive o token de acesso
    });

    it('valida a entrada com os schemas compartilhados', async () => {
      const res = await http.post('/auth/register').send({ email: 'x', password: '1', displayName: '' }).expect(400);
      expect(res.body.code).toBe('INVALID_INPUT');
      expect(res.body.issues.length).toBeGreaterThan(0);
    });
  });

  describe('partida solo', () => {
    let token: string;
    let gameId: string;

    it('cria a partida já na vez do jogador', async () => {
      token = (await guest('Solo')).token;
      const res = await http.post('/games').set(auth(token)).send({ mode: 'solo' }).expect(201);
      expect(res.body).toMatchObject({ status: 'active', phase: 'spin', isMyTurn: true, opponent: null, roundNumber: 1 });
      gameId = res.body.id;
    });

    it('gira, pede a pergunta sem gabarito e retoma a mesma pergunta', async () => {
      const spin = await http.post(`/games/${gameId}/spin`).set(auth(token)).expect(200);
      expect(spin.body).toMatchObject({ result: 'torah', sliceIndex: 0 });
      const spun = await http.get(`/games/${gameId}`).set(auth(token)).expect(200);
      expect(spun.body).toMatchObject({ phase: 'spun', pendingSpin: { spinId: spin.body.spinId } });

      await http.post(`/games/${gameId}/spin`).set(auth(token)).expect(409);
      const q = await http.post(`/games/${gameId}/question`).set(auth(token)).send({ spinId: spin.body.spinId }).expect(200);
      expect(q.body).toMatchObject({ category: 'torah', isCrownChallenge: false, timeLimitSeconds: GAME_RULES.questionTimeLimitSeconds });
      expect(q.body.serverNow).toBe(clock.now().toISOString());
      expect(Date.parse(q.body.deadlineAt) - Date.parse(q.body.serverNow)).toBe(GAME_RULES.questionTimeLimitSeconds * 1000);
      expect(q.body).not.toHaveProperty('correctIndex');
      expect(q.body).not.toHaveProperty('sourceRef');

      clock.advance(5_000);
      const again = await http.get(`/games/${gameId}/question`).set(auth(token)).expect(200);
      expect({ ...again.body, serverNow: undefined }).toEqual({ ...q.body, serverNow: undefined });
      expect(Date.parse(again.body.serverNow) - Date.parse(q.body.serverNow)).toBe(5_000);
      const state = await http.get(`/games/${gameId}`).set(auth(token)).expect(200);
      expect(state.body).toMatchObject({ phase: 'question', pendingPlayId: q.body.playId });

      const result = await answer(token, gameId, q.body.playId, true);
      expect(result).toMatchObject({ correct: true, timedOut: false, pointsAwarded: 10, crownProgress: 1, canSpinAgain: true, turnPassed: false });
      expect(result.source).toMatchObject({ ref: 'Genesis 1:3', url: 'https://www.sefaria.org/Genesis.1.3', license: 'Public Domain' });

      const twice = await http.post(`/games/${gameId}/answer`).set(auth(token)).send({ playId: q.body.playId, optionIndex: 0 }).expect(409);
      expect(twice.body.code).toBe('ALREADY_ANSWERED');
    });

    it('três acertos seguidos enchem a Coroa; acertar a disputa dá o selo', async () => {
      for (let i = 0; i < 2; i++) {
        const q = await spinAndAsk(token, gameId);
        await answer(token, gameId, q.playId, true);
      }
      const state = await http.get(`/games/${gameId}`).set(auth(token)).expect(200);
      expect(state.body).toMatchObject({ phase: 'choose_crown', me: { crownProgress: 3 } });
      // Só categorias com perguntas aprovadas (torah, talmud) e ainda sem selo.
      expect(state.body.crownChoices).toEqual(['torah', 'talmud']);
      await http.post(`/games/${gameId}/spin`).set(auth(token)).expect(409);

      const invalid = await http.post(`/games/${gameId}/crown`).set(auth(token)).send({ category: 'halakhah' }).expect(422);
      expect(invalid.body.code).toBe('INVALID_CROWN_CATEGORY');

      const challenge = await http.post(`/games/${gameId}/crown`).set(auth(token)).send({ category: 'talmud' }).expect(200);
      expect(challenge.body).toMatchObject({ isCrownChallenge: true, category: 'talmud' });
      const result = await answer(token, gameId, challenge.body.playId, true);
      expect(result).toMatchObject({ sealEarned: 'talmud', pointsAwarded: 10 + GAME_RULES.sealBonusPoints, crownProgress: 0, canSpinAgain: true });
    });

    it('erro e tempo esgotado passam a vez (no solo, conta a rodada)', async () => {
      const q = await spinAndAsk(token, gameId);
      const wrong = await answer(token, gameId, q.playId, false);
      expect(wrong).toMatchObject({ correct: false, turnPassed: true, crownProgress: 0 });

      const late = await spinAndAsk(token, gameId);
      clock.advance((GAME_RULES.questionTimeLimitSeconds + GAME_RULES.networkGraceSeconds + 1) * 1000);
      const timeout = await http
        .post(`/games/${gameId}/answer`)
        .set(auth(token))
        .send({ playId: late.playId, optionIndex: await optionFor(late.playId, true) })
        .expect(200);
      expect(timeout.body).toMatchObject({ correct: false, timedOut: true, turnPassed: true });

      const state = await http.get(`/games/${gameId}`).set(auth(token)).expect(200);
      expect(state.body).toMatchObject({ phase: 'spin', roundNumber: 3, me: { seals: ['talmud'], correctCount: 4, wrongCount: 2 } });
    });

    it('pergunta abandonada além do prazo é corrigida como erro na próxima consulta', async () => {
      const q = await spinAndAsk(token, gameId);
      clock.advance(60_000);
      const state = await http.get(`/games/${gameId}`).set(auth(token)).expect(200);
      expect(state.body).toMatchObject({ phase: 'spin', pendingPlayId: null, roundNumber: 4 });
      const late = await http.post(`/games/${gameId}/answer`).set(auth(token)).send({ playId: q.playId, optionIndex: 0 }).expect(409);
      expect(late.body.code).toBe('ALREADY_ANSWERED');
    });

    it('cair na fatia Coroa permite escolher o selo direto', async () => {
      rng.mode = 'last';
      const spin = await http.post(`/games/${gameId}/spin`).set(auth(token)).expect(200);
      rng.mode = 'first';
      expect(spin.body).toMatchObject({ result: 'crown', sliceIndex: 6 });
      const state = await http.get(`/games/${gameId}`).set(auth(token)).expect(200);
      expect(state.body.phase).toBe('choose_crown');
      const challenge = await http.post(`/games/${gameId}/crown`).set(auth(token)).send({ category: 'torah' }).expect(200);
      const result = await answer(token, gameId, challenge.body.playId, true);
      expect(result.sealEarned).toBe('torah');
    });

    it('o sexto selo encerra a partida com vitória', async () => {
      const me = await prisma.gamePlayer.findFirstOrThrow({ where: { gameId } });
      await prisma.gamePlayer.update({
        where: { id: me.id },
        data: { seals: ['torah', 'neviim_ketuvim', 'mishnah', 'halakhah', 'midrash_aggadah'], crownProgress: 3 },
      });
      const challenge = await http.post(`/games/${gameId}/crown`).set(auth(token)).send({ category: 'talmud' }).expect(200);
      const result = await answer(token, gameId, challenge.body.playId, true);
      expect(result).toMatchObject({ gameFinished: true, canSpinAgain: false });
      const state = await http.get(`/games/${gameId}`).set(auth(token)).expect(200);
      expect(state.body).toMatchObject({ status: 'finished', phase: 'finished', winnerUserId: state.body.me.userId });
    });
  });

  describe('partida com amigo', () => {
    it('convite, alternância de vez e W.O. por 48 h sem jogar', async () => {
      const a = await guest('Ana');
      const b = await guest('Beto');
      const created = await http.post('/games').set(auth(a.token)).send({ mode: 'friend' }).expect(201);
      expect(created.body).toMatchObject({ status: 'waiting_opponent', phase: 'waiting_opponent' });
      const code = created.body.inviteCode as string;
      expect(code).toMatch(/^[A-Z2-9]{6}$/);

      const own = await http.post('/games').set(auth(a.token)).send({ mode: 'friend', inviteCode: code }).expect(409);
      expect(own.body.code).toBe('OWN_GAME');
      const joined = await http.post('/games').set(auth(b.token)).send({ mode: 'friend', inviteCode: code.toLowerCase() }).expect(201);
      expect(joined.body).toMatchObject({ status: 'active', phase: 'opponent_turn', opponent: { displayName: 'Ana' } });
      const gameId = joined.body.id;

      const notYours = await http.post(`/games/${gameId}/spin`).set(auth(b.token)).expect(409);
      expect(notYours.body.code).toBe('NOT_YOUR_TURN');

      const q = await spinAndAsk(a.token, gameId);
      await answer(a.token, gameId, q.playId, false);
      const bState = await http.get(`/games/${gameId}`).set(auth(b.token)).expect(200);
      expect(bState.body).toMatchObject({ phase: 'spin', isMyTurn: true, roundNumber: 2 });

      const list = await http.get('/games').set(auth(b.token)).expect(200);
      expect(list.body[0]).toMatchObject({ id: gameId, isMyTurn: true, phase: 'spin', opponentName: 'Ana' });

      clock.advance((GAME_RULES.turnTimeoutHours + 1) * 3600 * 1000);
      // O token de acesso (15 min) venceu nesse meio-tempo: o app renova com o refresh token.
      const renewed = await http.post('/auth/refresh').send({ refreshToken: a.refresh }).expect(200);
      await http.get(`/games/${gameId}`).set(auth(a.token)).expect(401);
      const aState = await http.get(`/games/${gameId}`).set(auth(renewed.body.accessToken)).expect(200);
      expect(aState.body).toMatchObject({ status: 'finished', winnerUserId: a.id });
    });

    it('desistir dá a vitória ao adversário', async () => {
      const a = await guest('Caio');
      const b = await guest('Dina');
      rng.mode = 'cycle'; // gera um código de convite diferente do teste anterior
      const created = await http.post('/games').set(auth(a.token)).send({ mode: 'friend' }).expect(201);
      rng.mode = 'first';
      expect(created.body.inviteCode).not.toBe('AAAAAA');
      const joined = await http.post('/games').set(auth(b.token)).send({ mode: 'friend', inviteCode: created.body.inviteCode }).expect(201);
      const res = await http.post(`/games/${joined.body.id}/forfeit`).set(auth(b.token)).expect(200);
      expect(res.body).toMatchObject({ status: 'finished', winnerUserId: a.id });
    });
  });

  it('modo aleatório junta dois jogadores na mesma partida', async () => {
    const c = await guest('Eli');
    const d = await guest('Fani');
    const first = await http.post('/games').set(auth(c.token)).send({ mode: 'random' }).expect(201);
    expect(first.body.status).toBe('waiting_opponent');
    const again = await http.post('/games').set(auth(c.token)).send({ mode: 'random' }).expect(201);
    expect(again.body.id).toBe(first.body.id);
    const second = await http.post('/games').set(auth(d.token)).send({ mode: 'random' }).expect(201);
    expect(second.body).toMatchObject({ id: first.body.id, status: 'active' });
  });

  it('ranking semanal e geral', async () => {
    const g = await guest('Ranking');
    const week = await http.get('/ranking?period=week').set(auth(g.token)).expect(200);
    expect(week.body.entries[0]).toMatchObject({ position: 1, displayName: 'Solo' });
    expect(week.body.me).toBeNull();
    const all = await http.get('/ranking?period=all&limit=5').set(auth(g.token)).expect(200);
    expect(all.body.entries.length).toBeGreaterThan(0);
    expect(all.body.entries[0].points).toBeGreaterThanOrEqual(all.body.entries.at(-1).points);
  });

  it('denúncia de desrespeito de um revisor tira a pergunta de circulação', async () => {
    // Denúncias de contas novas e convidados só vão para a fila (security.e2e.test.ts);
    // um revisor é sempre confiável.
    const staff = await createStaff(prisma, { email: 'denuncia@exemplo.com', name: 'Rivka', role: 'reviewer' });
    const login = await http.post('/auth/login').send({ email: staff.email, password: staff.password }).expect(200);
    const token = login.body.accessToken as string;
    const game = await http.post('/games').set(auth(token)).send({ mode: 'solo' }).expect(201);
    const q = await spinAndAsk(token, game.body.id);
    await http.post('/questions/report').set(auth(token)).send({ playId: q.playId, reason: 'typo' }).expect(409); // ainda não respondeu
    await answer(token, game.body.id, q.playId, true);
    const res = await http.post('/questions/report').set(auth(token)).send({ playId: q.playId, reason: 'disrespectful', comment: 'tom inadequado' }).expect(201);
    expect(res.body).toEqual({ received: true, retired: true });
    const play = await prisma.questionPlay.findUniqueOrThrow({ where: { id: q.playId }, include: { question: true } });
    expect(play.question.status).toBe('retired');
    await http.post('/questions/report').set(auth(token)).send({ playId: q.playId, reason: 'typo' }).expect(409);
  });

  describe('revisão humana', () => {
    const admin: Record<string, string> = {};

    beforeAll(async () => {
      const staff = await createStaff(prisma, { email: 'revisora@exemplo.com', name: 'Revisora', role: 'reviewer' });
      const login = await http.post('/auth/login').send({ email: staff.email, password: staff.password }).expect(200);
      admin.Authorization = `Bearer ${login.body.accessToken}`;
    });

    it('exige conta de revisor e serve a página de revisão', async () => {
      await http.get('/admin/api/questions').expect(401);
      const player = await guest('Curioso');
      const denied = await http.get('/admin/api/questions').set(auth(player.token)).expect(403);
      expect(denied.body.code).toBe('FORBIDDEN');
      const me = await http.get('/admin/api/me').set(admin).expect(200);
      expect(me.body).toMatchObject({ displayName: 'Revisora', role: 'reviewer' });
      const page = await http.get('/admin').expect(200);
      expect(page.headers['content-security-policy']).toContain("script-src 'self'");
      expect(page.text).toContain('Revisão de perguntas');
      await http.get('/admin/app.js').expect(200).expect('Content-Type', /javascript/);
    });

    it('lista pendentes, aprova com edição e recusa alternativas repetidas', async () => {
      const list = await http.get('/admin/api/questions?status=pending_review&category=mishnah').set(admin).expect(200);
      expect(list.body.total).toBe(3);
      const item = list.body.items[0];
      expect(item.passage.segments[0].ref).toBe('Genesis 1:3');

      const bad = await http
        .post(`/admin/api/questions/${item.id}/review`)
        .set(admin)
        .send({ decision: 'approve', edits: { options: ['A', 'a', 'B', 'C'] } })
        .expect(422);
      expect(bad.body.code).toBe('DUPLICATE_OPTIONS');

      const ok = await http
        .post(`/admin/api/questions/${item.id}/review`)
        .set(admin)
        .send({ decision: 'approve', notes: 'ok', edits: { correctIndex: 1, difficulty: 'medium' } })
        .expect(200);
      expect(ok.body).toMatchObject({ status: 'approved', correctIndex: 1, difficulty: 'medium', aiDifficulty: 'easy' });
      expect(ok.body.reviews[0]).toMatchObject({ decision: 'approve', notes: 'ok', reviewer: 'Revisora' });
    });

    it('aprova em lote e libera a categoria na roleta', async () => {
      const list = await http.get('/admin/api/questions?status=pending_review').set(admin).expect(200);
      const res = await http
        .post('/admin/api/questions/bulk-review')
        .set(admin)
        .send({ ids: list.body.items.map((i: { id: string }) => i.id), decision: 'approve' })
        .expect(200);
      expect(res.body.updated).toBe(2);
      const stats = await http.get('/admin/api/stats').set(admin).expect(200);
      expect(stats.body.questions).toContainEqual({ category: 'mishnah', status: 'approved', count: 3 });
      expect(stats.body.openReports).toBe(1);
    });

    it('resolve denúncias', async () => {
      const reports = await http.get('/admin/api/reports').set(admin).expect(200);
      expect(reports.body).toHaveLength(1);
      expect(reports.body[0]).toMatchObject({ reason: 'disrespectful', trusted: true, triggeredRetirement: true });
      await http.post(`/admin/api/reports/${reports.body[0].id}/resolve`).set(admin).send({ action: 'restore' }).expect(200);
      const q = await prisma.question.findUniqueOrThrow({ where: { id: reports.body[0].question.id } });
      expect(q.status).toBe('approved');
      const resolved = await prisma.questionReport.findUniqueOrThrow({ where: { id: reports.body[0].id }, include: { resolvedBy: true } });
      expect(resolved).toMatchObject({ resolution: 'restore', resolvedBy: { displayName: 'Revisora' } });
    });
  });
});
