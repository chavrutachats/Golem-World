/**
 * "Pedras do Choshen" (Fase 11), ponta a ponta com PostgreSQL de verdade: o servidor
 * entrega a semente, refaz a partida com as jogadas e só então dá estrelas e moedas.
 */
import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@trivia/db';
import {
  PUZZLE_RULES,
  createPuzzle,
  goalProgress,
  playMove,
  puzzleLevel,
  type PuzzleLevel,
  type PuzzleMove,
  type PuzzleState,
} from '@trivia/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { loadAppConfig } from '../src/config/app-config.js';
import { configureApp } from '../src/security/http-hardening.js';

const url = process.env.TEST_DATABASE_URL;

/** Joga com o mesmo motor do app: "best" busca os objetivos; "worst" foge deles. */
function play(level: PuzzleLevel, seed: number, mode: 'best' | 'worst', from?: PuzzleState, limit = Infinity): { state: PuzzleState; moves: PuzzleMove[] } {
  let state = from ?? createPuzzle(level, seed);
  const moves: PuzzleMove[] = [];
  const value = (s: PuzzleState) => (s.status === 'won' ? 1e9 : -goalProgress(s).reduce((sum, p) => sum + p.remaining, 0) + s.score / 1000);
  while (state.status === 'playing' && moves.length < limit) {
    let pick: { m: PuzzleMove; s: PuzzleState; v: number } | null = null;
    for (let r = 0; r < level.rows; r++) {
      for (let c = 0; c < level.cols; c++) {
        for (const m of [[r, c, r, c + 1], [r, c, r + 1, c]] as PuzzleMove[]) {
          const res = playMove(state, m);
          if (!res.ok) continue;
          const v = mode === 'best' ? value(res.state) : -value(res.state);
          if (!pick || v > pick.v) pick = { m, s: res.state, v };
        }
      }
    }
    if (!pick) throw new Error('sem jogada');
    moves.push(pick.m);
    state = pick.s;
  }
  return { state, moves };
}

describe.skipIf(!url)('Pedras do Choshen (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let http: ReturnType<typeof request>;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  async function guest(name: string) {
    const res = await http.post('/auth/guest').send({ displayName: name }).expect(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  }

  beforeAll(async () => {
    prisma = createPrismaClient({ databaseUrl: url! });
    await prisma.$executeRawUnsafe('TRUNCATE "PuzzleRun", "RewardTicket", "WalletEntry", "RefreshToken", "User" CASCADE');
    const config = loadAppConfig({
      DATABASE_URL: url!,
      JWT_ACCESS_SECRET: 'segredo-de-acesso-para-testes-com-32-chars',
      JWT_REFRESH_SECRET: 'segredo-de-refresh-para-testes-com-32-chars',
      NODE_ENV: 'test',
      RATE_LIMIT_ENABLED: 'false',
      MAINTENANCE_ENABLED: 'false',
      BOTS_ENABLED: 'false',
      TRANSLATION_PROVIDER: 'off',
      TRANSLATION_WARMER: 'false',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).compile();
    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false }), config);
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('as fases abrem em ordem; vencer dá estrelas e moedas, e o servidor confere refazendo a partida', async () => {
    const g = await guest('Betzalel');
    expect((await http.get('/puzzle').set(auth(g.token)).expect(200)).body).toEqual({ unlocked: 1, levels: [], totalStars: 0 });
    const locked = await http.post('/puzzle/runs').set(auth(g.token)).send({ level: 2 }).expect(409);
    expect(locked.body.code).toBe('PUZZLE_LOCKED');

    const run = (await http.post('/puzzle/runs').set(auth(g.token)).send({ level: 1 }).expect(200)).body;
    expect(run).toMatchObject({ level: 1, extraMoves: 0 });
    const { state, moves } = play(puzzleLevel(1), run.seed, 'best');
    expect(state.status).toBe('won');

    // Jogada inventada no meio: recusada, e a partida continua aberta.
    const forged = [...moves.slice(0, 1), [0, 0, 7, 6], ...moves.slice(1)];
    expect((await http.post(`/puzzle/runs/${run.id}/finish`).set(auth(g.token)).send({ moves: forged }).expect(422)).body.code).toBe('PUZZLE_INVALID');
    // Jogada a mais depois de vencer também não existe.
    await http.post(`/puzzle/runs/${run.id}/finish`).set(auth(g.token)).send({ moves: [...moves, moves[0]] }).expect(422);

    const done = (await http.post(`/puzzle/runs/${run.id}/finish`).set(auth(g.token)).send({ moves }).expect(200)).body;
    expect(done).toMatchObject({ status: 'won', score: state.score, unlocked: 2 });
    expect(done.stars).toBeGreaterThanOrEqual(1);
    expect(done.coins).toBe(done.stars * PUZZLE_RULES.coinsPerStar);
    expect(done.economy.wallet.coins).toBe(done.coins);
    expect((await http.post(`/puzzle/runs/${run.id}/finish`).set(auth(g.token)).send({ moves }).expect(409)).body.code).toBe('PUZZLE_FINISHED');

    // Repetir a fase com as mesmas estrelas não rende moedas de novo.
    const again = (await http.post('/puzzle/runs').set(auth(g.token)).send({ level: 1 }).expect(200)).body;
    const replayed = play(puzzleLevel(1), again.seed, 'best');
    const second = (await http.post(`/puzzle/runs/${again.id}/finish`).set(auth(g.token)).send({ moves: replayed.moves }).expect(200)).body;
    expect(second.coins).toBe(Math.max(0, second.stars - done.stars) * PUZZLE_RULES.coinsPerStar);

    const overview = (await http.get('/puzzle').set(auth(g.token)).expect(200)).body;
    expect(overview).toMatchObject({ unlocked: 2, totalStars: Math.max(done.stars, second.stars) });
    expect(overview.levels[0]).toMatchObject({ level: 1, stars: Math.max(done.stars, second.stars) });
  });

  it('a partida é de quem começou; começar outra encerra a anterior', async () => {
    const a = await guest('Oholiav');
    const b = await guest('Bezalel B');
    const first = (await http.post('/puzzle/runs').set(auth(a.token)).send({ level: 1 }).expect(200)).body;
    await http.post(`/puzzle/runs/${first.id}/finish`).set(auth(b.token)).send({ moves: [] }).expect(404);
    const second = (await http.post('/puzzle/runs').set(auth(a.token)).send({ level: 1 }).expect(200)).body;
    expect((await http.post(`/puzzle/runs/${first.id}/finish`).set(auth(a.token)).send({ moves: [] }).expect(409)).body.code).toBe('PUZZLE_FINISHED');
    // Desistir logo no começo: sem estrelas nem moedas.
    expect((await http.post(`/puzzle/runs/${second.id}/finish`).set(auth(a.token)).send({ moves: [] }).expect(200)).body).toMatchObject({ status: 'abandoned', stars: 0, coins: 0 });
  });

  it('acabaram as jogadas: o anúncio dá +5 jogadas, uma vez, e o servidor aceita as jogadas a mais', async () => {
    const g = await guest('Kohen');
    // Abre a fase 50 (as anteriores já vencidas).
    await prisma.puzzleRun.createMany({
      data: Array.from({ length: 49 }, (_, i) => ({ userId: g.id, level: i + 1, seed: 1, status: 'won' as const, stars: 1, endedAt: new Date() })),
    });
    const run = (await http.post('/puzzle/runs').set(auth(g.token)).send({ level: 50 }).expect(200)).body;
    const level = puzzleLevel(50);
    const lost = play(level, run.seed, 'worst');
    expect(lost.state.status).toBe('lost');

    // Sem o prêmio, jogada além do limite não vale.
    const extra = play(level, run.seed, 'worst', { ...lost.state, movesLeft: 5, status: 'playing' }, 5);
    const allMoves = [...lost.moves, ...extra.moves];
    await http.post(`/puzzle/runs/${run.id}/finish`).set(auth(g.token)).send({ moves: allMoves }).expect(422);

    const offer = (await http.post('/rewards/offers').set(auth(g.token)).send({ placement: 'moves', ref: run.id }).expect(200)).body;
    expect(offer.prize).toEqual({ kind: 'moves', amount: PUZZLE_RULES.extraMoves });
    await http.post(`/rewards/${offer.id}/watched`).set(auth(g.token)).expect(200);
    await http.post(`/rewards/${offer.id}/claim`).set(auth(g.token)).expect(200);
    expect((await prisma.puzzleRun.findUniqueOrThrow({ where: { id: run.id } })).extraMoves).toBe(PUZZLE_RULES.extraMoves);
    expect((await http.post('/rewards/offers').set(auth(g.token)).send({ placement: 'moves', ref: run.id }).expect(409)).body.code).toBe('REWARD_ALREADY_CLAIMED');

    const res = (await http.post(`/puzzle/runs/${run.id}/finish`).set(auth(g.token)).send({ moves: allMoves }).expect(200)).body;
    expect(res.status).toBe(extra.state.status === 'won' ? 'won' : 'lost');
    // Partida encerrada não recebe mais o prêmio.
    await http.post('/rewards/offers').set(auth(g.token)).send({ placement: 'moves', ref: run.id }).expect(409);
  });
});
