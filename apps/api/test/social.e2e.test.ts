/**
 * Login social ponta a ponta (Fase 10), com PostgreSQL de verdade e provedores falsos
 * (a conferência dos tokens tem os próprios testes em social.unit.test.ts).
 */
import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@trivia/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { SOCIAL_VERIFIERS, type SocialVerifiers } from '../src/auth/social/social.service.js';
import type { SocialVerifier } from '../src/auth/social/verifiers.js';
import { Errors } from '../src/common/http.js';
import { loadAppConfig } from '../src/config/app-config.js';
import { configureApp } from '../src/security/http-hardening.js';

const url = process.env.TEST_DATABASE_URL;

/** Token falso: "ok|<sub>|<email>|<nome>". */
function fake(provider: 'google' | 'apple' | 'facebook'): SocialVerifier {
  return {
    provider,
    async verify({ token }) {
      const [tag, subject, email, name] = token.split('|');
      if (tag !== 'ok' || !subject) throw Errors.unprocessable('SOCIAL_INVALID', 'Não foi possível confirmar o login com este serviço. Tente de novo.');
      return { subject, email: email || null, name: name || null };
    },
  };
}

describe.skipIf(!url)('login social (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let http: ReturnType<typeof request>;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const social = (provider: string, token: string, session?: string) => {
    const req = http.post('/auth/social').send({ provider, token: token.padEnd(20, '.'), nonce: 'nonce-qualquer-1234567' });
    return session ? req.set(auth(session)) : req;
  };

  beforeAll(async () => {
    prisma = createPrismaClient({ databaseUrl: url! });
    await prisma.$executeRawUnsafe('TRUNCATE "JourneyRun", "UserItem", "RefreshToken", "Game", "User" CASCADE');
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
    const verifiers: SocialVerifiers = { google: fake('google'), apple: fake('apple') };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).overrideProvider(SOCIAL_VERIFIERS).useValue(verifiers).compile();
    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false }), config);
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('diz quais logins este servidor aceita', async () => {
    expect((await http.get('/auth/providers').expect(200)).body).toEqual({ google: true, apple: true, facebook: false });
    const off = await social('facebook', 'ok|1|a@b.com|Ana').expect(409);
    expect(off.body.code).toBe('PROVIDER_OFF');
  });

  it('cria a conta no primeiro login e entra nela nas próximas vezes', async () => {
    const first = await social('google', 'ok|g-100|shimon@exemplo.com|Shimon Pires da Silva').expect(200);
    // Só o primeiro nome vai para o ranking.
    expect(first.body.user).toMatchObject({ displayName: 'Shimon', isGuest: false });
    const again = await social('google', 'ok|g-100|shimon@exemplo.com|Shimon').expect(200);
    expect(again.body.user.id).toBe(first.body.user.id);
    const me = await http.get('/me').set(auth(again.body.accessToken)).expect(200);
    expect(me.body).toMatchObject({ email: 'shimon@exemplo.com', hasPassword: false, identities: ['google'] });
    expect((await social('google', 'nao|g-100').expect(422)).body.code).toBe('SOCIAL_INVALID');
  });

  it('convidado que entra com a Apple vira conta completa e mantém o progresso', async () => {
    const guest = await http.post('/auth/guest').send({ displayName: 'Golem Curioso' }).expect(201);
    await prisma.user.update({ where: { id: guest.body.user.id }, data: { coins: 77, totalPoints: 30 } });
    const linked = await social('apple', 'ok|a-200|', guest.body.accessToken).expect(200);
    expect(linked.body.user).toMatchObject({ id: guest.body.user.id, displayName: 'Golem Curioso', isGuest: false });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: guest.body.user.id } });
    expect(user).toMatchObject({ coins: 77, totalPoints: 30, isGuest: false });
    expect(user.registeredAt).not.toBeNull();
    // Do outro aparelho, o mesmo login da Apple entra nessa conta.
    expect((await social('apple', 'ok|a-200|').expect(200)).body.user.id).toBe(guest.body.user.id);
  });

  it('um login nunca serve a dois jogadores', async () => {
    const other = await http.post('/auth/guest').send({}).expect(201);
    const res = await social('google', 'ok|g-100|shimon@exemplo.com|Shimon', other.body.accessToken).expect(409);
    expect(res.body.code).toBe('IDENTITY_IN_USE');
    expect(res.body.message).toContain('Google');
  });

  it('e-mail de uma conta com senha não vira login social sem o jogador pedir', async () => {
    const reg = await http
      .post('/auth/register')
      .send({ email: 'miriam@exemplo.com', password: 'Tamborim-junto-ao-mar-15', displayName: 'Miriam' })
      .expect(201);
    const res = await social('google', 'ok|g-300|miriam@exemplo.com|Miriam').expect(409);
    expect(res.body.code).toBe('ACCOUNT_EXISTS');
    // Entrando com a senha, ela conecta o Google no perfil.
    const linked = await social('google', 'ok|g-300|miriam@exemplo.com|Miriam', reg.body.accessToken).expect(200);
    expect(linked.body.user.id).toBe(reg.body.user.id);
    expect((await social('google', 'ok|g-300|miriam@exemplo.com|Miriam').expect(200)).body.user.id).toBe(reg.body.user.id);
  });

  it('desliga um login só se sobrar outro jeito de entrar', async () => {
    const acct = await social('google', 'ok|g-400||Davi').expect(200);
    const last = await http.delete('/me/identities/google').set(auth(acct.body.accessToken)).expect(409);
    expect(last.body.code).toBe('LAST_LOGIN');
    await social('apple', 'ok|a-400|', acct.body.accessToken).expect(200);
    const me = await http.delete('/me/identities/google').set(auth(acct.body.accessToken)).expect(200);
    expect(me.body.identities).toEqual(['apple']);
    await http.delete('/me/identities/facebook').set(auth(acct.body.accessToken)).expect(404);
    await http.delete('/me/identities/instagram').set(auth(acct.body.accessToken)).expect(400);
  });

  it('excluir a conta solta o login (a mesma conta do Google pode começar de novo)', async () => {
    const acct = await social('google', 'ok|g-500||Ester').expect(200);
    await http.post('/me/delete').set(auth(acct.body.accessToken)).send({ confirm: true }).expect(204);
    const fresh = await social('google', 'ok|g-500||Ester').expect(200);
    expect(fresh.body.user.id).not.toBe(acct.body.user.id);
  });
});
