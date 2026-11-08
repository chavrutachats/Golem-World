/**
 * Economia da Fase 9, ponta a ponta, com PostgreSQL de verdade: compras (de
 * demonstração), shekels e moedas de sabedoria no extrato, armário nas duas moedas,
 * ajudas da mochila, anúncios com prêmio (oferta → confirmação → resgate) e o ritmo do
 * anúncio obrigatório.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@trivia/db';
import { BOOST_RULES, LIVES_RULES, SHEKEL_OFFERS, WHEEL_PRIZES } from '@trivia/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK, RANDOM } from '../src/common/infra.js';
import { loadAppConfig } from '../src/config/app-config.js';
import { configureApp } from '../src/security/http-hardening.js';

const url = process.env.TEST_DATABASE_URL;

const clock = {
  current: new Date('2027-01-10T12:00:00Z'),
  now() {
    return new Date(this.current);
  },
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  },
};

// LCG em 32 bits (Math.imul não perde precisão como a multiplicação em double) e pelos bits
// altos, que variam mais que os baixos.
const rng = {
  counter: 11,
  int(max: number) {
    this.counter = (Math.imul(this.counter, 1103515245) + 12345) >>> 0;
    return (this.counter >>> 16) % max;
  },
};

describe.skipIf(!url)('economia (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let http: ReturnType<typeof request>;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  async function guest(name: string) {
    const res = await http.post('/auth/guest').send({ displayName: name, locale: 'en' }).expect(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  }
  const buyShekels = (token: string, productId = 'shekels_120', receipt: string = randomUUID()) =>
    http.post('/store/purchases').set(auth(token)).send({ store: 'demo', productId, receipt });
  /** Oferta → anúncio visto (modo demo) → resgate. */
  async function watchAndClaim(token: string, placement: string, ref?: string) {
    const offer = await http.post('/rewards/offers').set(auth(token)).send({ placement, ref }).expect(200);
    await http.post(`/rewards/${offer.body.id}/watched`).set(auth(token)).expect(200);
    const claim = await http.post(`/rewards/${offer.body.id}/claim`).set(auth(token)).expect(200);
    return { offer: offer.body, claim: claim.body };
  }

  beforeAll(async () => {
    prisma = createPrismaClient({ databaseUrl: url! });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "JourneyAnswer", "JourneyRun", "JourneyProgress", "UserItem", "QuestionReport", "QuestionPlay", "Spin", "Turn", "GamePlayer", "Game", "RefreshToken", "QuestionReview", "Question", "GenerationBatch", "SourcePassage", "StudyText", "User" CASCADE',
    );
    const rows = JSON.parse(readFileSync(new URL('./fixtures/journey-bereshit.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
    await prisma.studyText.createMany({ data: rows.map((r) => ({ ...(r as object), contentHash: 'f'.repeat(64) })) as never });

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
    expect(config.economy).toMatchObject({ adsMode: 'demo', storeMode: 'demo' });
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

  describe('compras e carteira', () => {
    it('começa zerado, no modo de demonstração', async () => {
      const g = await guest('Carteira Nova');
      const res = await http.get('/economy').set(auth(g.token)).expect(200);
      expect(res.body).toMatchObject({
        wallet: { coins: 0, shekels: 0 },
        adFree: false,
        boosts: { time: 0, skip: 0, eliminate: 0 },
        lives: { lives: LIVES_RULES.max, max: LIVES_RULES.max },
        ads: { mode: 'demo' },
        store: { mode: 'demo' },
      });
      expect(res.body.rewardsToday.life).toEqual({ used: 0, cap: 5 });
    });

    it('a mesma compra entregue duas vezes não dá shekels em dobro', async () => {
      const g = await guest('Comprador');
      const receipt = randomUUID();
      const first = await buyShekels(g.token, 'shekels_120', receipt).expect(200);
      expect(first.body).toMatchObject({ alreadyGranted: false, granted: { shekels: 120, adFree: false } });
      expect(first.body.economy.wallet.shekels).toBe(120);
      const again = await buyShekels(g.token, 'shekels_120', receipt).expect(200);
      expect(again.body).toMatchObject({ alreadyGranted: true, granted: { shekels: 0 } });
      expect(again.body.economy.wallet.shekels).toBe(120);
      // Outra conta não consegue usar a mesma compra.
      const other = await guest('Espertinho');
      const stolen = await buyShekels(other.token, 'shekels_120', receipt).expect(409);
      expect(stolen.body.code).toBe('PURCHASE_OTHER_ACCOUNT');
      // Recibo malformado e produto desconhecido.
      expect((await buyShekels(g.token, 'shekels_120', 'nao-e-um-recibo').expect(422)).body.code).toBe('PURCHASE_INVALID');
      expect((await buyShekels(g.token, 'shekels_999').expect(422)).body.code).toBe('UNKNOWN_PRODUCT');
      // O extrato conta a história, com o saldo depois de cada linha.
      const ledger = await prisma.walletEntry.findMany({ where: { userId: g.id } });
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({ currency: 'shekels', delta: 120, balance: 120, reason: 'purchase', idempotencyKey: `purchase:demo:demo:${receipt}` });
    });

    it('duas entregas simultâneas da mesma compra creditam uma vez', async () => {
      const g = await guest('Apressado');
      const receipt = randomUUID();
      const results = await Promise.all([buyShekels(g.token, 'shekels_650', receipt), buyShekels(g.token, 'shekels_650', receipt)]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const state = await http.get('/economy').set(auth(g.token)).expect(200);
      expect(state.body.wallet.shekels).toBe(650);
    });

    it('shekels compram material e visitantes; personagens da história pedem a parashá', async () => {
      const g = await guest('Fantasiado');
      await buyShekels(g.token).expect(200);
      const shop = await http.get('/journey/shop').set(auth(g.token)).expect(200);
      const byId = (id: string) => shop.body.items.find((i: { id: string }) => i.id === id);
      expect(byId('cobre')).toMatchObject({ currency: 'shekels', price: 120, purchasable: true });
      expect(byId('adao')).toMatchObject({ currency: 'coins', price: 150, purchasable: false });
      expect(byId('adao').howToEarn).toMatch(/Bereshit/);
      expect(byId('oculos')).toMatchObject({ currency: 'coins', price: 120, purchasable: true });

      const locked = await http.post('/journey/shop/buy').set(auth(g.token)).send({ itemId: 'adao' }).expect(409);
      expect(locked.body.code).toBe('ITEM_LOCKED');
      const poor = await http.post('/journey/shop/buy').set(auth(g.token)).send({ itemId: 'davi' }).expect(409);
      expect(poor.body.code).toBe('NOT_ENOUGH_SHEKELS');
      const bought = await http.post('/journey/shop/buy').set(auth(g.token)).send({ itemId: 'barro-nilo' }).expect(200);
      expect(bought.body.shekels).toBe(60);
      const look = await http.post('/journey/shop/equip').set(auth(g.token)).send({ itemId: 'barro-nilo', equipped: true }).expect(200);
      expect(look.body.golem.equipped).toMatchObject({ head: 'kipa-azul', skin: 'barro-nilo' });

      // Com a Torá de Bereshit concluída, Adão sai por moedas de sabedoria.
      await prisma.journeyProgress.create({ data: { userId: g.id, nodeId: 'bereshit:torah', bestStars: 3, firstCompletedAt: clock.now(), lastCompletedAt: clock.now() } });
      await prisma.user.update({ where: { id: g.id }, data: { coins: 200 } });
      const adam = await http.post('/journey/shop/buy').set(auth(g.token)).send({ itemId: 'adao' }).expect(200);
      expect(adam.body).toMatchObject({ coins: 50, shekels: 60 });
    });

    it('shekels recarregam as vidas da roleta e enchem a mochila, com limites', async () => {
      const g = await guest('Mochileiro');
      await buyShekels(g.token).expect(200);
      const full = await http.post('/economy/offers').set(auth(g.token)).send({ offerId: 'lives-refill' }).expect(409);
      expect(full.body.code).toBe('LIVES_FULL');
      await prisma.user.update({ where: { id: g.id }, data: { lives: 0, livesUpdatedAt: clock.now() } });
      const refill = await http.post('/economy/offers').set(auth(g.token)).send({ offerId: 'lives-refill' }).expect(200);
      expect(refill.body.lives.lives).toBe(LIVES_RULES.max);
      expect(refill.body.wallet.shekels).toBe(120 - SHEKEL_OFFERS.find((o) => o.id === 'lives-refill')!.price);

      const boosts = await http.post('/economy/offers').set(auth(g.token)).send({ offerId: 'time-3' }).expect(200);
      expect(boosts.body.boosts.time).toBe(3);
      await prisma.userBoost.update({ where: { userId_kind: { userId: g.id, kind: 'time' } }, data: { count: BOOST_RULES.maxPerKind - 1 } });
      const tooMany = await http.post('/economy/offers').set(auth(g.token)).send({ offerId: 'time-3' }).expect(409);
      expect(tooMany.body.code).toBe('BOOSTS_FULL');
    });

    it('"Sem anúncios" é permanente e restaurável', async () => {
      const g = await guest('Sem Anuncio');
      const receipt = randomUUID();
      const res = await buyShekels(g.token, 'no_ads', receipt).expect(200);
      expect(res.body).toMatchObject({ granted: { adFree: true }, economy: { adFree: true } });
      await prisma.user.update({ where: { id: g.id }, data: { adFree: false, adBreakTarget: 1 } });
      const restored = await buyShekels(g.token, 'no_ads', receipt).expect(200);
      expect(restored.body).toMatchObject({ alreadyGranted: true, economy: { adFree: true } });
      // Sem anúncio obrigatório, mesmo na pausa da meta…
      for (let i = 0; i < 6; i++) {
        expect((await http.post('/ads/break').set(auth(g.token)).send({ kind: 'match' }).expect(200)).body.action).toBe('none');
      }
      // …mas os anúncios com prêmio continuam disponíveis.
      await prisma.user.update({ where: { id: g.id }, data: { lives: 2, livesUpdatedAt: clock.now() } });
      await http.post('/rewards/offers').set(auth(g.token)).send({ placement: 'life' }).expect(200);
    });
  });

  describe('Golem World: ajudas da mochila', () => {
    it('+10 s uma vez por pergunta; sem cota nem mochila, nada de poder', async () => {
      const g = await guest('Golem Apressado');
      await prisma.userBoost.create({ data: { userId: g.id, kind: 'time', count: 2 } });
      const run = await http.post('/journey/runs').set(auth(g.token)).send({ nodeId: 'bereshit:torah' }).expect(201);
      expect(run.body.boosts).toEqual({ time: 2, skip: 0, eliminate: 0 });
      const q = await http.post(`/journey/runs/${run.body.runId}/question`).set(auth(g.token)).expect(200);
      expect(q.body.timeAdded).toBe(false);
      const more = await http.post(`/journey/runs/${run.body.runId}/power`).set(auth(g.token)).send({ answerId: q.body.answerId, kind: 'time' }).expect(200);
      expect(more.body).toMatchObject({ kind: 'time', source: 'boost' });
      expect(new Date(more.body.deadlineAt).getTime() - new Date(q.body.deadlineAt).getTime()).toBe(BOOST_RULES.timeSeconds * 1000);
      expect(more.body.run.boosts.time).toBe(1);
      const twice = await http.post(`/journey/runs/${run.body.runId}/power`).set(auth(g.token)).send({ answerId: q.body.answerId, kind: 'time' }).expect(409);
      expect(twice.body.code).toBe('TIME_ADDED');
      const reloaded = await http.post(`/journey/runs/${run.body.runId}/question`).set(auth(g.token)).expect(200);
      expect(reloaded.body).toMatchObject({ timeAdded: true, deadlineAt: more.body.deadlineAt });
      // Sem óculos (cota da fase) e sem ajuda na mochila.
      const none = await http.post(`/journey/runs/${run.body.runId}/power`).set(auth(g.token)).send({ answerId: q.body.answerId, kind: 'eliminate' }).expect(409);
      expect(none.body.code).toBe('NO_POWER');
      await prisma.userBoost.create({ data: { userId: g.id, kind: 'eliminate', count: 1 } });
      const elim = await http.post(`/journey/runs/${run.body.runId}/power`).set(auth(g.token)).send({ answerId: q.body.answerId, kind: 'eliminate' }).expect(200);
      expect(elim.body).toMatchObject({ source: 'boost', run: { boosts: { eliminate: 0 } } });
      expect(elim.body.eliminated).toHaveLength(2);
    });

    it('as moedas da fase entram no extrato, uma linha por acerto', async () => {
      const g = await guest('Golem Estudioso');
      const run = await http.post('/journey/runs').set(auth(g.token)).send({ nodeId: 'bereshit:torah' }).expect(201);
      const q = await http.post(`/journey/runs/${run.body.runId}/question`).set(auth(g.token)).expect(200);
      const a = await prisma.journeyAnswer.findUniqueOrThrow({ where: { id: q.body.answerId }, include: { question: true } });
      const res = await http
        .post(`/journey/runs/${run.body.runId}/answer`)
        .set(auth(g.token))
        .send({ answerId: q.body.answerId, optionIndex: a.optionOrder.indexOf(a.question.correctIndex) })
        .expect(200);
      expect(res.body.coinsAwarded).toBeGreaterThan(0);
      const ledger = await prisma.walletEntry.findMany({ where: { userId: g.id } });
      expect(ledger).toEqual([expect.objectContaining({ currency: 'coins', delta: res.body.coinsAwarded, reason: 'journey', idempotencyKey: `journey:${q.body.answerId}` })]);
    });
  });

  describe('anúncios com prêmio', () => {
    it('vida: o prêmio só sai depois do anúncio, e uma vez só', async () => {
      const g = await guest('Sem Vidas');
      expect((await http.post('/rewards/offers').set(auth(g.token)).send({ placement: 'life' }).expect(409)).body.code).toBe('LIVES_FULL');
      await prisma.user.update({ where: { id: g.id }, data: { lives: 0, livesUpdatedAt: clock.now() } });
      const offer = await http.post('/rewards/offers').set(auth(g.token)).send({ placement: 'life' }).expect(200);
      expect(offer.body).toMatchObject({ placement: 'life', prize: { kind: 'life', amount: 1 }, status: 'offered', ssvCustomData: offer.body.id });
      // Pedir de novo devolve a mesma oferta (ninguém "sorteia de novo").
      expect((await http.post('/rewards/offers').set(auth(g.token)).send({ placement: 'life' }).expect(200)).body.id).toBe(offer.body.id);
      const early = await http.post(`/rewards/${offer.body.id}/claim`).set(auth(g.token)).expect(200);
      expect(early.body.status).toBe('pending');
      expect(early.body.economy.lives.lives).toBe(0);
      await http.post(`/rewards/${offer.body.id}/watched`).set(auth(g.token)).expect(200);
      const [c1, c2] = await Promise.all([
        http.post(`/rewards/${offer.body.id}/claim`).set(auth(g.token)),
        http.post(`/rewards/${offer.body.id}/claim`).set(auth(g.token)),
      ]);
      expect([c1.body.status, c2.body.status]).toEqual(['claimed', 'claimed']);
      const state = await http.get('/economy').set(auth(g.token)).expect(200);
      expect(state.body.lives.lives).toBe(1);
      expect(state.body.rewardsToday.life.used).toBe(1);
      // Outra conta não confirma nem resgata o prêmio alheio.
      const other = await guest('Curioso');
      await http.post(`/rewards/${offer.body.id}/claim`).set(auth(other.token)).expect(404);
    });

    it('continuar com 1 coração depois de perder o último, uma vez por fase', async () => {
      const g = await guest('Quase Perdeu');
      const run = await http.post('/journey/runs').set(auth(g.token)).send({ nodeId: 'bereshit:torah' }).expect(201);
      await prisma.journeyRun.update({ where: { id: run.body.runId }, data: { hearts: 1 } });
      const q = await http.post(`/journey/runs/${run.body.runId}/question`).set(auth(g.token)).expect(200);
      const a = await prisma.journeyAnswer.findUniqueOrThrow({ where: { id: q.body.answerId }, include: { question: true } });
      const wrong = (a.optionOrder.indexOf(a.question.correctIndex) + 1) % 4;
      const lost = await http.post(`/journey/runs/${run.body.runId}/answer`).set(auth(g.token)).send({ answerId: q.body.answerId, optionIndex: wrong }).expect(200);
      expect(lost.body.run).toMatchObject({ status: 'failed', hearts: 0, revived: false });

      const { offer, claim } = await watchAndClaim(g.token, 'continue', run.body.runId);
      expect(offer.prize).toEqual({ kind: 'heart' });
      expect(claim.status).toBe('claimed');
      const after = await http.get(`/journey/runs/${run.body.runId}`).set(auth(g.token)).expect(200);
      expect(after.body).toMatchObject({ status: 'active', hearts: 1, revived: true, obstacleIndex: 0 });
      await http.post(`/journey/runs/${run.body.runId}/question`).set(auth(g.token)).expect(200);
      const again = await http.post('/rewards/offers').set(auth(g.token)).send({ placement: 'continue', ref: run.body.runId }).expect(409);
      expect(again.body.code).toBe('REWARD_ALREADY_CLAIMED');
    });

    it('dobrar as moedas de uma fase concluída, dentro do prazo', async () => {
      const g = await guest('Dobrador');
      const run = await prisma.journeyRun.create({
        data: { userId: g.id, nodeId: 'bereshit:torah', status: 'completed', hearts: 3, maxHearts: 3, obstacleCount: 6, obstacleIndex: 6, coins: 37, timeLimitSec: 30, endedAt: clock.now() },
      });
      const { claim } = await watchAndClaim(g.token, 'double', run.id);
      expect(claim.economy.wallet.coins).toBe(37);
      const late = await prisma.journeyRun.create({
        data: { userId: g.id, nodeId: 'bereshit:torah', status: 'completed', hearts: 3, maxHearts: 3, obstacleCount: 6, obstacleIndex: 6, coins: 10, timeLimitSec: 30, endedAt: new Date(clock.now().getTime() - 60 * 60_000) },
      });
      expect((await http.post('/rewards/offers').set(auth(g.token)).send({ placement: 'double', ref: late.id }).expect(409)).body.code).toBe('REWARD_EXPIRED');
    });

    it('face do Prêmio do sevivon: só com anúncio, uma vez por turno, e o prêmio sai uma vez', async () => {
      const g = await guest('Sevivonista');
      // Sem dizer que mostra anúncio, o sevivon nunca cai no Prêmio.
      for (let i = 0; i < 8; i++) {
        const game = await http.post('/games').set(auth(g.token)).send({ mode: 'solo' }).expect(201);
        expect(game.body.roundPrize).toBeNull();
        const spin = await http.post(`/games/${game.body.id}/spin`).set(auth(g.token)).expect(200);
        expect(spin.body.result).not.toBe('prize');
        expect(spin.body.prize).toBeNull();
      }
      let landed: { gameId: string; spin: { sliceIndex: number; prize: { ref: string; prize: unknown; claimed: boolean } } } | null = null;
      for (let i = 0; i < 40 && !landed; i++) {
        const game = await http.post('/games').set(auth(g.token)).send({ mode: 'solo' }).expect(201);
        const spin = await http.post(`/games/${game.body.id}/spin`).set(auth(g.token)).send({ withPrize: true }).expect(200);
        if (spin.body.result === 'prize') landed = { gameId: game.body.id, spin: spin.body };
      }
      expect(landed).not.toBeNull();
      const { gameId, spin } = landed!;
      expect(spin.sliceIndex).toBe(7);
      expect(spin.prize.claimed).toBe(false);
      expect(WHEEL_PRIZES.map((p) => p.prize)).toContainEqual(spin.prize.prize);
      // Cair no Prêmio não gasta a vez: continua na fase de girar, com o prêmio à mostra.
      const s1 = await http.get(`/games/${gameId}`).set(auth(g.token)).expect(200);
      expect(s1.body.phase).toBe('spin');
      expect(s1.body.roundPrize).toEqual(spin.prize);
      const { offer, claim } = await watchAndClaim(g.token, 'wheel', spin.prize.ref);
      expect(offer.prize).toEqual(spin.prize.prize);
      expect(claim.status).toBe('claimed');
      expect((await http.get(`/games/${gameId}`).set(auth(g.token)).expect(200)).body.roundPrize).toBeNull();
      // A rodada de outra pessoa não vale.
      const other = await guest('Penetra');
      await http.post('/rewards/offers').set(auth(other.token)).send({ placement: 'wheel', ref: spin.prize.ref }).expect(404);
      // No mesmo turno, o Prêmio não sai de novo.
      const again = await http.post(`/games/${gameId}/spin`).set(auth(g.token)).send({ withPrize: true }).expect(200);
      expect(again.body.result).not.toBe('prize');
      // Um turno que não caiu no Prêmio não tem prêmio para resgatar.
      const plain = await http.post('/games').set(auth(g.token)).send({ mode: 'solo' }).expect(201);
      const turn = await prisma.turn.findFirstOrThrow({ where: { game: { id: plain.body.id } } });
      const refused = await http.post('/rewards/offers').set(auth(g.token)).send({ placement: 'wheel', ref: turn.id }).expect(409);
      expect(refused.body.code).toBe('REWARD_NOT_AVAILABLE');
    });

    it('teto diário por lugar', async () => {
      const g = await guest('Viciado em Ajuda');
      for (let i = 0; i < 3; i++) {
        const { claim } = await watchAndClaim(g.token, 'boost');
        expect(claim.ticket.prize.kind).toBe('boost');
      }
      const capped = await http.post('/rewards/offers').set(auth(g.token)).send({ placement: 'boost' }).expect(409);
      expect(capped.body.code).toBe('REWARD_DAILY_LIMIT');
      const state = await http.get('/economy').set(auth(g.token)).expect(200);
      expect(Object.values(state.body.boosts as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(3);
    });

    it('a confirmação do Google só existe com anúncios reais', async () => {
      await http.get('/rewards/ssv?ad_network=1&custom_data=x&signature=abc&key_id=1').expect(404);
    });
  });

  describe('anúncio obrigatório', () => {
    it('a cada 3 a 5 pausas, com o presente antes; assistir por vontade própria adia o próximo', async () => {
      const g = await guest('Pausado');
      const actions: string[] = [];
      let gift: { id: string; prize: unknown } | null = null;
      for (let i = 0; i < 5 && !gift; i++) {
        const res = await http.post('/ads/break').set(auth(g.token)).send({ kind: 'level' }).expect(200);
        actions.push(res.body.action);
        gift = res.body.gift;
      }
      expect(actions.slice(0, -1).every((a) => a === 'none')).toBe(true);
      expect(actions.at(-1)).toBe('ad');
      expect(actions.length).toBeGreaterThanOrEqual(3);
      expect(gift).toMatchObject({ prize: expect.any(Object) });
      // Logo depois, nada (intervalo mínimo e meta nova).
      expect((await http.post('/ads/break').set(auth(g.token)).send({ kind: 'level' }).expect(200)).body.action).toBe('none');
      // O presente aceito vale como anúncio visto e entrega o prêmio.
      await http.post(`/rewards/${gift!.id}/watched`).set(auth(g.token)).expect(200);
      expect((await http.post(`/rewards/${gift!.id}/claim`).set(auth(g.token)).expect(200)).body.status).toBe('claimed');
      const user = await prisma.user.findUniqueOrThrow({ where: { id: g.id } });
      expect(user.adBreaks).toBe(0);
      expect(user.adBreakTarget).toBeGreaterThanOrEqual(3);
      expect(user.adBreakTarget).toBeLessThanOrEqual(5);
      // O presente não pode ser pedido fora da pausa.
      expect((await http.post('/rewards/offers').set(auth(g.token)).send({ placement: 'gift' }).expect(422)).body.code).toBe('REWARD_PLACEMENT');
    });

    it('com as vidas cheias, o presente da pausa nunca é uma vida (no puzzle parecia que alguma tinha sido perdida)', async () => {
      const g = await guest('Vidas cheias');
      const kinds = new Set<string>();
      for (let i = 0; i < 12; i++) {
        // Toda pausa vira hora do anúncio: meta 1 e o último anúncio longe no passado.
        await prisma.user.update({ where: { id: g.id }, data: { adBreaks: 0, adBreakTarget: 1, lastAdAt: new Date(Date.now() - 3_600_000) } });
        const res = await http.post('/ads/break').set(auth(g.token)).send({ kind: 'level' }).expect(200);
        expect(res.body.action).toBe('ad');
        kinds.add(res.body.gift.prize.kind);
      }
      expect(kinds.has('life')).toBe(false);
      expect((await http.get('/economy').set(auth(g.token)).expect(200)).body.lives.lives).toBe(5);
    });
  });
});
