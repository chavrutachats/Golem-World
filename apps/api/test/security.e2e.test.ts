/**
 * Testes de segurança ponta a ponta: cabeçalhos, limites de requisição, sessões,
 * senhas, exclusão de conta, revisores, denúncias e limpeza.
 * Usam o mesmo banco de teste do e2e.test.ts (as tabelas são apagadas).
 *
 * TRUST_PROXY=loopback deixa o teste escolher o IP de cada "cliente" pelo
 * X-Forwarded-For, para isolar os contadores por IP entre um teste e outro.
 */
import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@trivia/db';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createStaff, grantRole, revokeRole } from '../src/cli/accounts-admin.js';
import { CLOCK } from '../src/common/infra.js';
import { loadAppConfig } from '../src/config/app-config.js';
import { REPORT_RULES } from '../src/questions/reports.module.js';
import { configureApp } from '../src/security/http-hardening.js';
import { MaintenanceService } from '../src/security/maintenance.service.js';

const url = process.env.TEST_DATABASE_URL;
const ACCESS_SECRET = 'segredo-de-acesso-para-testes-com-32-chars';

const clock = {
  current: new Date('2026-11-02T12:00:00Z'),
  now() {
    return new Date(this.current);
  },
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  },
};
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe.skipIf(!url)('segurança (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let http: ReturnType<typeof request>;
  let passageId: string;
  let ipCounter = 10;

  /** Um "cliente" com IP próprio. */
  function client() {
    const ip = `203.0.113.${ipCounter++}`;
    return {
      ip,
      get: (path: string) => http.get(path).set('X-Forwarded-For', ip),
      post: (path: string) => http.post(path).set('X-Forwarded-For', ip),
      patch: (path: string) => http.patch(path).set('X-Forwarded-For', ip),
    };
  }
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function guest(name = 'Visitante Teste') {
    const res = await client().post('/auth/guest').send({ displayName: name }).expect(201);
    return { token: res.body.accessToken as string, refresh: res.body.refreshToken as string, id: res.body.user.id as string };
  }

  let emailCounter = 0;
  async function registered(password = 'figueira-de-jerico-3') {
    const email = `pessoa${emailCounter++}@exemplo.com`;
    const res = await client().post('/auth/register').send({ email, password, displayName: `Pessoa ${emailCounter}` }).expect(201);
    return { email, password, token: res.body.accessToken as string, refresh: res.body.refreshToken as string, id: res.body.user.id as string };
  }

  /** Abre uma pergunta numa partida solo, responde e devolve o playId (para denunciar). */
  async function answeredPlay(token: string): Promise<{ playId: string; questionId: string }> {
    const game = await http.post('/games').set(auth(token)).send({ mode: 'solo' }).expect(201);
    const spin = await http.post(`/games/${game.body.id}/spin`).set(auth(token)).expect(200);
    const q =
      spin.body.result === 'crown'
        ? await http.post(`/games/${game.body.id}/crown`).set(auth(token)).send({ category: 'torah' }).expect(200)
        : await http.post(`/games/${game.body.id}/question`).set(auth(token)).send({ spinId: spin.body.spinId }).expect(200);
    await http.post(`/games/${game.body.id}/answer`).set(auth(token)).send({ playId: q.body.playId, optionIndex: 0 }).expect(200);
    const play = await prisma.questionPlay.findUniqueOrThrow({ where: { id: q.body.playId } });
    return { playId: play.id, questionId: play.questionId };
  }

  /** Deixa a conta "confiável" para denúncias: com 4 dias e 30 respostas no histórico. */
  async function makeTrusted(userId: string, token: string) {
    await answeredPlay(token);
    const seat = await prisma.gamePlayer.findFirstOrThrow({ where: { userId }, include: { turns: true } });
    const question = await prisma.question.findFirstOrThrow({ where: { status: 'approved' } });
    await prisma.questionPlay.createMany({
      data: Array.from({ length: REPORT_RULES.trustedMinAnswered }, () => ({
        turnId: seat.turns[0]!.id,
        playerId: seat.id,
        userId,
        questionId: question.id,
        category: question.category!,
        difficulty: question.difficulty,
        optionOrder: [0, 1, 2, 3],
        // Horários do relógio do teste (não o da máquina), coerentes entre si.
        servedAt: new Date(clock.now().getTime() - 10_000),
        deadlineAt: clock.now(),
        answeredAt: clock.now(),
        chosenIndex: 0,
        isCorrect: true,
      })),
    });
    await prisma.user.update({ where: { id: userId }, data: { registeredAt: new Date(clock.now().getTime() - 4 * DAY) } });
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
        segments: [{ ref: 'Genesis 1:3', en: 'And God said: Let there be light. And there was light.' }],
        contentHash: 'y'.repeat(64),
        wordCount: 12,
      },
    });
    passageId = passage.id;
    // Todas as fatias da roleta com perguntas, para o giro nunca cair numa categoria vazia.
    const categories = ['torah', 'neviim_ketuvim', 'mishnah', 'talmud', 'halakhah', 'midrash_aggadah'] as const;
    for (const category of categories) {
      for (let n = 0; n < 40; n++) {
        await prisma.question.create({
          data: {
            passageId,
            category,
            text: `Pergunta de segurança ${category} ${n}?`,
            options: [`Certa ${n}`, `Errada A ${n}`, `Errada B ${n}`, `Errada C ${n}`],
            correctIndex: 0,
            explanation: 'Explicação de teste com base no trecho.',
            sourceRef: 'Genesis 1:3',
            evidenceQuote: 'Let there be light',
            evidenceLanguage: 'en',
            aiDifficulty: 'easy',
            difficulty: 'easy',
            status: 'approved',
            dedupeKey: `sec-${category}-${String(n).padStart(3, '0')}`.padEnd(64, 'x'),
          },
        });
      }
    }

    const config = loadAppConfig({
      DATABASE_URL: url!,
      JWT_ACCESS_SECRET: ACCESS_SECRET,
      JWT_REFRESH_SECRET: 'segredo-de-refresh-para-testes-com-32-chars',
      NODE_ENV: 'test',
      CORS_ORIGINS: 'http://localhost:8081',
      TRUST_PROXY: 'loopback',
      MAINTENANCE_ENABLED: 'false',
      BOTS_ENABLED: 'false',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();
    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false }), config);
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  describe('cabeçalhos e entrada', () => {
    it('manda cabeçalhos de segurança e nunca deixa resposta em cache', async () => {
      const res = await http.get('/health').expect(200);
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['strict-transport-security']).toBeUndefined(); // só em produção
    });

    it('recusa corpo JSON acima de 16 KB', async () => {
      await client().post('/auth/guest').set('Content-Type', 'application/json').send(JSON.stringify({ displayName: 'x'.repeat(20_000) })).expect(413);
    });

    it('CORS só para as origens configuradas', async () => {
      const ok = await http.get('/health').set('Origin', 'http://localhost:8081').expect(200);
      expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:8081');
      const evil = await http.get('/health').set('Origin', 'https://evil.example').expect(200);
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('recusa tokens adulterados', async () => {
      const g = await guest();
      const [h, p] = g.token.split('.');
      const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${p}.`;
      await http.get('/me').set(auth(none)).expect(401);
      const forged = await new SignJWT({ sv: 0 })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(g.id)
        .setIssuer('trivia-torah')
        .setAudience('trivia-app')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode('outro-segredo-qualquer-com-32-chars!!'));
      await http.get('/me').set(auth(forged)).expect(401);
      await http.get('/me').set(auth(`${h}.${p}.assinatura-trocada`)).expect(401);
      await http.get('/me').set(auth(g.token)).expect(200);
    });
  });

  describe('limite de requisições', () => {
    it('limita a criação de convidados por IP e informa quanto esperar', async () => {
      const c = client();
      for (let i = 0; i < 30; i++) await c.post('/auth/guest').send({}).expect(201);
      const blocked = await c.post('/auth/guest').send({}).expect(429);
      expect(blocked.body.code).toBe('RATE_LIMITED');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      await client().post('/auth/guest').send({}).expect(201); // outro IP segue normal
      clock.advance(2 * HOUR);
      await c.post('/auth/guest').send({}).expect(201);
    });

    it('bloqueia a conta depois de 5 senhas erradas do mesmo IP, mesmo com a senha certa', async () => {
      const u = await registered();
      const c = client();
      for (let i = 0; i < 5; i++) await c.post('/auth/login').send({ email: u.email, password: 'errada-errada-1' }).expect(401);
      const blocked = await c.post('/auth/login').send({ email: u.email, password: u.password }).expect(429);
      expect(blocked.body.message).toMatch(/Muitas tentativas de login/);
      await client().post('/auth/login').send({ email: u.email, password: u.password }).expect(200); // de outro IP, entra
      clock.advance(31 * MINUTE);
      await c.post('/auth/login').send({ email: u.email, password: u.password }).expect(200);
    });

    it('conta tentativas também para e-mail sem conta (o bloqueio não revela quem existe)', async () => {
      const c = client();
      for (let i = 0; i < 5; i++) await c.post('/auth/login').send({ email: 'ninguem@exemplo.com', password: 'qualquer-coisa-1' }).expect(401);
      await c.post('/auth/login').send({ email: 'ninguem@exemplo.com', password: 'qualquer-coisa-1' }).expect(429);
    });

    it('barra ataque distribuído: 30 senhas erradas por conta em 1 h, de qualquer IP', async () => {
      clock.advance(2 * HOUR);
      const u = await registered();
      for (let ip = 0; ip < 6; ip++) {
        const c = client();
        for (let i = 0; i < 5; i++) await c.post('/auth/login').send({ email: u.email, password: 'errada-errada-2' }).expect(401);
      }
      await client().post('/auth/login').send({ email: u.email, password: u.password }).expect(429);
      clock.advance(2 * HOUR);
      await client().post('/auth/login').send({ email: u.email, password: u.password }).expect(200);
    }, 60_000); // 30 hashes scrypt de propósito lentos

    it('limita trocas de nome por conta', async () => {
      const g = await guest();
      for (let i = 0; i < 10; i++) await http.patch('/me').set(auth(g.token)).send({ displayName: `Nome ${i}` }).expect(200);
      const blocked = await http.patch('/me').set(auth(g.token)).send({ displayName: 'Nome final' }).expect(429);
      expect(blocked.body.code).toBe('RATE_LIMITED');
    });

    it('senhas erradas em paralelo não furam o limite (a tentativa conta antes do hash)', async () => {
      clock.advance(2 * HOUR);
      const u = await registered();
      const c = client();
      const results = await Promise.all(
        Array.from({ length: 12 }, () => c.post('/auth/login').send({ email: u.email, password: 'errada-em-paralelo-1' })),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 401)).toHaveLength(5);
      expect(statuses.filter((s) => s === 429)).toHaveLength(7);
    }, 30_000);

    it('limita criar ou entrar em partida (tentar códigos de convite)', async () => {
      const g = await guest();
      for (let i = 0; i < 30; i++) {
        await http.post('/games').set(auth(g.token)).send({ mode: 'friend', inviteCode: `ZZZZ${String(i).padStart(2, '2').replace(/[01]/g, '2')}` });
      }
      const blocked = await http.post('/games').set(auth(g.token)).send({ mode: 'solo' }).expect(429);
      expect(blocked.body.code).toBe('RATE_LIMITED');
    });
  });

  describe('sessões', () => {
    it('"sair de todos os aparelhos" derruba tokens de acesso e de renovação', async () => {
      const u = await registered();
      const other = await client().post('/auth/login').send({ email: u.email, password: u.password }).expect(200);
      await http.post('/auth/logout-all').set(auth(u.token)).expect(204);
      await http.get('/me').set(auth(u.token)).expect(401);
      await http.get('/me').set(auth(other.body.accessToken)).expect(401);
      await http.post('/auth/refresh').send({ refreshToken: other.body.refreshToken }).expect(401);
      await http.post('/auth/refresh').send({ refreshToken: u.refresh }).expect(401);
    });

    it('tolera reuso do refresh token por até 60 s (resposta perdida na rede)', async () => {
      const g = await guest();
      const first = await http.post('/auth/refresh').send({ refreshToken: g.refresh }).expect(200);
      const retry = await http.post('/auth/refresh').send({ refreshToken: g.refresh }).expect(200);
      await http.get('/me').set(auth(first.body.accessToken)).expect(200);
      await http.get('/me').set(auth(retry.body.accessToken)).expect(200);
      // A tolerância vale UMA vez: o terceiro uso do mesmo token é vazamento e derruba tudo.
      await http.post('/auth/refresh').send({ refreshToken: g.refresh }).expect(401);
      await http.get('/me').set(auth(first.body.accessToken)).expect(401);
      await http.post('/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(401);
    });

    it('duas renovações simultâneas com o mesmo token funcionam (duas abas do navegador)', async () => {
      const g = await guest();
      const [a, b] = await Promise.all([
        http.post('/auth/refresh').send({ refreshToken: g.refresh }),
        http.post('/auth/refresh').send({ refreshToken: g.refresh }),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      await http.get('/me').set(auth(a.body.accessToken)).expect(200);
      await http.get('/me').set(auth(b.body.accessToken)).expect(200);
    });

    it('"sair de todos" e troca de senha derrubam também o token que acabou de girar', async () => {
      const u = await registered();
      const r1 = await http.post('/auth/refresh').send({ refreshToken: u.refresh }).expect(200);
      await http.post('/auth/logout-all').set(auth(r1.body.accessToken)).expect(204);
      await http.post('/auth/refresh').send({ refreshToken: u.refresh }).expect(401); // estava na tolerância
      await http.post('/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);

      const login = await client().post('/auth/login').send({ email: u.email, password: u.password }).expect(200);
      const r2 = await http.post('/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(200);
      const changed = await http
        .post('/me/password')
        .set(auth(r2.body.accessToken))
        .send({ currentPassword: u.password, newPassword: 'oliveira-do-monte-8' })
        .expect(200);
      await http.post('/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);
      await http.post('/auth/refresh').send({ refreshToken: changed.body.refreshToken }).expect(200);
    });

    it('mantém no máximo 10 sessões; a mais antiga cai sem derrubar as outras', async () => {
      const u = await registered();
      const sessions = [{ refresh: u.refresh }];
      for (let i = 0; i < 10; i++) {
        const res = await client().post('/auth/login').send({ email: u.email, password: u.password }).expect(200);
        sessions.push({ refresh: res.body.refreshToken });
      }
      await http.post('/auth/refresh').send({ refreshToken: sessions[0]!.refresh }).expect(401);
      await http.post('/auth/refresh').send({ refreshToken: sessions.at(-1)!.refresh }).expect(200);
    });

    it('troca de senha exige a atual, recusa senha comum e encerra as outras sessões', async () => {
      const u = await registered();
      const other = await client().post('/auth/login').send({ email: u.email, password: u.password }).expect(200);
      const wrong = await http.post('/me/password').set(auth(u.token)).send({ currentPassword: 'nao-e-essa-1', newPassword: 'oliveira-do-monte-8' }).expect(422);
      expect(wrong.body.code).toBe('WRONG_PASSWORD');
      const common = await http.post('/me/password').set(auth(u.token)).send({ currentPassword: u.password, newPassword: 'iloveyou12345' }).expect(422);
      expect(common.body.code).toBe('WEAK_PASSWORD');
      const ok = await http.post('/me/password').set(auth(u.token)).send({ currentPassword: u.password, newPassword: 'oliveira-do-monte-8' }).expect(200);
      await http.get('/me').set(auth(ok.body.accessToken)).expect(200);
      await http.get('/me').set(auth(u.token)).expect(401);
      await http.get('/me').set(auth(other.body.accessToken)).expect(401);
      await client().post('/auth/login').send({ email: u.email, password: u.password }).expect(401);
      await client().post('/auth/login').send({ email: u.email, password: 'oliveira-do-monte-8' }).expect(200);
    });

    it('convidado não tem senha para trocar', async () => {
      const g = await guest();
      const res = await http.post('/me/password').set(auth(g.token)).send({ currentPassword: 'x', newPassword: 'oliveira-do-monte-8' }).expect(422);
      expect(res.body.code).toBe('GUEST_ACCOUNT');
    });
  });

  describe('senhas e nomes', () => {
    it('recusa no cadastro senha curta, comum ou com o próprio e-mail', async () => {
      const short = await client().post('/auth/register').send({ email: 'a1@exemplo.com', password: 'curta-1', displayName: 'Ana' }).expect(400);
      expect(short.body.code).toBe('INVALID_INPUT');
      const common = await client().post('/auth/register').send({ email: 'a2@exemplo.com', password: 'password1234', displayName: 'Ana' }).expect(422);
      expect(common.body).toMatchObject({ code: 'WEAK_PASSWORD' });
      const padded = await client().post('/auth/register').send({ email: 'a3@exemplo.com', password: 'Sunshine-2026!!', displayName: 'Ana' }).expect(422);
      expect(padded.body.message).toMatch(/vazadas ou muito usadas/);
      const personal = await client().post('/auth/register').send({ email: 'rebeca.levi@exemplo.com', password: 'rebeca.levi.1990', displayName: 'Rebeca' }).expect(422);
      expect(personal.body.message).toMatch(/e-mail ou seu nome/);
    });

    it('guarda a senha com scrypt (N=2^15, r=8, p=3) e refaz hashes antigos no login', async () => {
      const u = await registered();
      const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(row.passwordHash).toMatch(/^scrypt\$32768\$8\$3\$/);
      // Simula um hash da fase anterior (p=1).
      const { scryptSync, randomBytes } = await import('node:crypto');
      const salt = randomBytes(16);
      const old = scryptSync(u.password.normalize('NFKC'), salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
      await prisma.user.update({ where: { id: u.id }, data: { passwordHash: ['scrypt', 32768, 8, 1, salt.toString('base64url'), old.toString('base64url')].join('$') } });
      await client().post('/auth/login').send({ email: u.email, password: u.password }).expect(200);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(after.passwordHash).toMatch(/^scrypt\$32768\$8\$3\$/);
    });

    it('recusa apelidos reservados e ofensivos', async () => {
      const reserved = await client().post('/auth/guest').send({ displayName: 'Moderador' }).expect(400);
      expect(reserved.body.issues[0].message).toMatch(/reservado/);
      const g = await guest();
      const offensive = await http.patch('/me').set(auth(g.token)).send({ displayName: 'Hitler' }).expect(400);
      expect(offensive.body.issues[0].message).toMatch(/não pode ser usado/);
    });
  });

  describe('exclusão de conta', () => {
    it('conta cadastrada confirma com a senha; dados apagados e adversário vence', async () => {
      const u = await registered();
      const rival = await guest('Rival');
      const created = await http.post('/games').set(auth(u.token)).send({ mode: 'friend' }).expect(201);
      const joined = await http.post('/games').set(auth(rival.token)).send({ mode: 'friend', inviteCode: created.body.inviteCode }).expect(201);
      const waiting = await http.post('/games').set(auth(u.token)).send({ mode: 'friend' }).expect(201);
      const { playId } = await answeredPlay(u.token);
      await http.post('/questions/report').set(auth(u.token)).send({ playId, reason: 'typo', comment: 'meu comentário pessoal' }).expect(201);

      const noPassword = await http.post('/me/delete').set(auth(u.token)).send({ confirm: true }).expect(422);
      expect(noPassword.body.code).toBe('PASSWORD_REQUIRED');
      const wrong = await http.post('/me/delete').set(auth(u.token)).send({ confirm: true, password: 'nao-e-essa-1' }).expect(422);
      expect(wrong.body.code).toBe('WRONG_PASSWORD');
      await http.post('/me/delete').set(auth(u.token)).send({ password: u.password }).expect(400); // sem confirm
      await http.post('/me/delete').set(auth(u.token)).send({ confirm: true, password: u.password }).expect(204);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(row).toMatchObject({ email: null, passwordHash: null, displayName: 'Conta excluída', totalPoints: 0 });
      expect(row.deletedAt).not.toBeNull();
      expect(await prisma.refreshToken.count({ where: { userId: u.id } })).toBe(0);
      const report = await prisma.questionReport.findFirstOrThrow({ where: { userId: u.id } });
      expect(report.comment).toBeNull();

      await http.get('/me').set(auth(u.token)).expect(401);
      await http.post('/auth/refresh').send({ refreshToken: u.refresh }).expect(401);
      await client().post('/auth/login').send({ email: u.email, password: u.password }).expect(401);

      const rivalView = await http.get(`/games/${joined.body.id}`).set(auth(rival.token)).expect(200);
      expect(rivalView.body).toMatchObject({ status: 'finished', winnerUserId: rival.id, opponent: { displayName: 'Conta excluída' } });
      const invite = await prisma.game.findUniqueOrThrow({ where: { id: waiting.body.id } });
      expect(invite).toMatchObject({ status: 'abandoned', inviteCode: null });

      // O e-mail fica livre para um cadastro novo.
      await client().post('/auth/register').send({ email: u.email, password: 'romã-de-sete-gomos', displayName: 'De volta' }).expect(201);
    });

    it('convidado exclui só com a confirmação; some do ranking', async () => {
      const g = await guest('Some Daqui');
      await answeredPlay(g.token);
      await http.post('/me/delete').set(auth(g.token)).send({ confirm: true }).expect(204);
      const viewer = await guest();
      const ranking = await http.get('/ranking?period=all').set(auth(viewer.token)).expect(200);
      expect(ranking.body.entries.map((e: { userId: string }) => e.userId)).not.toContain(g.id);
    });

    it('tem uma página web para pedir a exclusão (Google Play)', async () => {
      const page = await http.get('/conta/excluir').expect(200);
      expect(page.headers['content-security-policy']).toContain("script-src 'self'");
      expect(page.text).toContain('Excluir sua conta');
      await http.get('/conta/excluir.js').expect(200).expect('Content-Type', /javascript/);
    });
  });

  describe('revisores', () => {
    it('o papel vem do banco: tirar o papel corta o acesso na hora', async () => {
      const staff = await createStaff(prisma, { email: 'staff@exemplo.com', name: 'Ana Revisora', role: 'reviewer' });
      const login = await client().post('/auth/login').send({ email: staff.email, password: staff.password }).expect(200);
      await http.get('/admin/api/stats').set(auth(login.body.accessToken)).expect(200);
      await revokeRole(prisma, staff.email);
      await http.get('/admin/api/stats').set(auth(login.body.accessToken)).expect(401);
      const again = await client().post('/auth/login').send({ email: staff.email, password: staff.password }).expect(200);
      await http.get('/admin/api/stats').set(auth(again.body.accessToken)).expect(403);
      await grantRole(prisma, staff.email, 'reviewer');
      await http.get('/admin/api/stats').set(auth(again.body.accessToken)).expect(200);
    });

    it('convidado não pode virar revisor', async () => {
      const g = await guest();
      await expect(grantRole(prisma, g.id, 'reviewer')).rejects.toThrow(/Convidados/);
    });
  });

  describe('denúncias', () => {
    it('convidado e conta nova não tiram pergunta de circulação sozinhos', async () => {
      const g = await guest('Visitante Bravo');
      const a = await answeredPlay(g.token);
      const res = await http.post('/questions/report').set(auth(g.token)).send({ playId: a.playId, reason: 'disrespectful' }).expect(201);
      expect(res.body).toEqual({ received: true, retired: false });
      expect((await prisma.question.findUniqueOrThrow({ where: { id: a.questionId } })).status).toBe('approved');
      expect(await prisma.questionReport.findFirstOrThrow({ where: { userId: g.id } })).toMatchObject({ trusted: false, triggeredRetirement: false });

      const fresh = await registered();
      const b = await answeredPlay(fresh.token);
      const res2 = await http.post('/questions/report').set(auth(fresh.token)).send({ playId: b.playId, reason: 'disrespectful' }).expect(201);
      expect(res2.body.retired).toBe(false);
    });

    it('convidado "envelhecido" não vira confiável no instante em que se cadastra', async () => {
      const g = await guest('Veterano');
      await makeTrusted(g.id, g.token);
      await prisma.user.update({ where: { id: g.id }, data: { createdAt: new Date(clock.now().getTime() - 30 * DAY), registeredAt: null } });
      await client().post('/auth/register').set(auth(g.token)).send({ email: 'veterano@exemplo.com', password: 'figueira-de-jerico-3', displayName: 'Veterano' }).expect(201);
      const a = await answeredPlay(g.token);
      const res = await http.post('/questions/report').set(auth(g.token)).send({ playId: a.playId, reason: 'disrespectful' }).expect(201);
      expect(res.body.retired).toBe(false);
    });

    it('jogador confiável tira a pergunta na hora', async () => {
      const u = await registered();
      await makeTrusted(u.id, u.token);
      const a = await answeredPlay(u.token);
      const res = await http.post('/questions/report').set(auth(u.token)).send({ playId: a.playId, reason: 'disrespectful' }).expect(201);
      expect(res.body.retired).toBe(true);
      expect((await prisma.question.findUniqueOrThrow({ where: { id: a.questionId } })).status).toBe('retired');
    });

    it('disjuntor: passado o limite diário de retiradas automáticas, a denúncia só vai para a fila', async () => {
      const u = await registered();
      await makeTrusted(u.id, u.token);
      const others = await prisma.question.findMany({ where: { status: 'approved' }, take: REPORT_RULES.maxAutoRetirementsPerDay, skip: 100 });
      const reporters = await Promise.all(others.map(() => guest('Enchimento')));
      await prisma.questionReport.createMany({
        data: others.map((q, i) => ({ questionId: q.id, userId: reporters[i]!.id, reason: 'typo', trusted: true, triggeredRetirement: true, createdAt: clock.now() })),
      });
      const a = await answeredPlay(u.token);
      const res = await http.post('/questions/report').set(auth(u.token)).send({ playId: a.playId, reason: 'disrespectful' }).expect(201);
      expect(res.body.retired).toBe(false);
      expect((await prisma.question.findUniqueOrThrow({ where: { id: a.questionId } })).status).toBe('approved');
    });
  });

  describe('convites', () => {
    it('convite vence em 7 dias, mesmo sem a limpeza periódica', async () => {
      const a = await guest('Anfitriã');
      const b = await guest('Atrasado');
      const created = await http.post('/games').set(auth(a.token)).send({ mode: 'friend' }).expect(201);
      await prisma.game.update({ where: { id: created.body.id }, data: { createdAt: new Date(clock.now().getTime() - 8 * DAY) } });
      const res = await http.post('/games').set(auth(b.token)).send({ mode: 'friend', inviteCode: created.body.inviteCode }).expect(409);
      expect(res.body.code).toBe('INVITE_EXPIRED');
    });
  });

  describe('limpeza periódica', () => {
    it('apaga tokens vencidos, fecha convites parados e remove convidados sem uso', async () => {
      const maintenance = app.get(MaintenanceService);
      const now = clock.now().getTime();
      const idle = await prisma.user.create({ data: { displayName: 'Sumido', isGuest: true, createdAt: new Date(now - 40 * DAY) } });
      await prisma.refreshToken.create({ data: { userId: idle.id, tokenHash: 'h'.repeat(64), expiresAt: new Date(now - 5 * DAY) } });
      const player = await guest('Jogou');
      await prisma.user.update({ where: { id: player.id }, data: { createdAt: new Date(now - 40 * DAY) } });
      const invite = await http.post('/games').set(auth(player.token)).send({ mode: 'friend' }).expect(201);
      await prisma.game.update({ where: { id: invite.body.id }, data: { createdAt: new Date(now - 8 * DAY) } });

      const report = await maintenance.runOnce();
      expect(report.tokensDeleted).toBeGreaterThanOrEqual(1);
      expect(report.invitesClosed).toBeGreaterThanOrEqual(1);
      expect(report.guestsDeleted).toBeGreaterThanOrEqual(1);
      expect(await prisma.user.findUnique({ where: { id: idle.id } })).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: player.id } })).not.toBeNull();
      expect((await prisma.game.findUniqueOrThrow({ where: { id: invite.body.id } })).status).toBe('abandoned');
    });
  });
});
