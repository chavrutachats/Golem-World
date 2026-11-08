/**
 * Peças da economia que não precisam de banco: a confirmação do AdMob (SSV), os
 * verificadores das lojas e os prêmios fixos por contexto.
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import { WHEEL_PRIZES } from '@trivia/shared';
import { describe, expect, it, vi } from 'vitest';
import { AdmobSsvVerifier, SsvError } from '../src/economy/admob-ssv.js';
import { giftPrize, wheelPrize } from '../src/economy/prizes.js';
import { DemoVerifier, GoogleVerifier, type PlayHttp } from '../src/economy/store/verifiers.js';
import { AppError } from '../src/common/http.js';

describe('AdMob SSV', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keysBody = { keys: [{ keyId: 3335741209, pem }] };

  /** Monta a consulta como o Google: campos em ordem, assinatura no fim. */
  function signedQuery(fields: Record<string, string>, keyId = '3335741209'): string {
    const message = new URLSearchParams(fields).toString();
    const signature = sign('sha256', Buffer.from(message), privateKey).toString('base64url');
    return `${message}&signature=${signature}&key_id=${keyId}`;
  }
  const FIELDS = {
    ad_network: '5450213213286189855',
    ad_unit: '1234567890',
    custom_data: '6f1c7d3e-1d0a-4a9b-9f8e-2b8c4b1a7e55',
    reward_amount: '1',
    reward_item: 'Reward',
    timestamp: '1767225600000',
    transaction_id: '123456789',
    user_id: '0b8f0c51-6a0d-4b0e-9f42-6a8f7a0b5c33',
  };

  it('confere a assinatura e devolve os campos', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => keysBody }));
    const ssv = new AdmobSsvVerifier('https://keys.test', fetchFn);
    const payload = await ssv.verify(signedQuery(FIELDS));
    expect(payload).toMatchObject({ customData: FIELDS.custom_data, userId: FIELDS.user_id, transactionId: '123456789', rewardAmount: 1 });
    // As chaves ficam em cache.
    await ssv.verify(signedQuery(FIELDS));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('recusa consulta adulterada, sem assinatura ou com chave desconhecida', async () => {
    const ssv = new AdmobSsvVerifier('https://keys.test', async () => ({ ok: true, status: 200, json: async () => keysBody }));
    const tampered = signedQuery(FIELDS).replace('reward_amount=1', 'reward_amount=1000');
    await expect(ssv.verify(tampered)).rejects.toBeInstanceOf(SsvError);
    await expect(ssv.verify(new URLSearchParams(FIELDS).toString())).rejects.toThrow(/sem assinatura/);
    await expect(ssv.verify(signedQuery(FIELDS, '42'))).rejects.toThrow(/key_id desconhecido/);
  });

  it('busca as chaves de novo quando o Google troca de chave', async () => {
    const rotated = { keys: [{ keyId: 99, pem }] };
    const bodies = [keysBody, rotated];
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => bodies.shift() ?? rotated }));
    const ssv = new AdmobSsvVerifier('https://keys.test', fetchFn);
    await ssv.verify(signedQuery(FIELDS));
    await expect(ssv.verify(signedQuery(FIELDS, '99'))).resolves.toMatchObject({ transactionId: '123456789' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('Google Play', () => {
  function play(responses: Record<string, { status?: number; data?: unknown }>): { http: PlayHttp; calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      http: {
        async request<T>({ url, method = 'GET' }: { url: string; method?: 'GET' | 'POST' }) {
          calls.push(`${method} ${url}`);
          const key = Object.keys(responses).find((k) => url.endsWith(k))!;
          const r = responses[key]!;
          if (r.status && r.status >= 400) throw Object.assign(new Error(`HTTP ${r.status}`), { response: { status: r.status } });
          return { data: r.data as T };
        },
      },
    };
  }

  it('compra concluída: entrega e confirma no Google', async () => {
    const { http, calls } = play({
      '/tokens/tok-1': { data: { purchaseState: 0, acknowledgementState: 0, purchaseTimeMillis: '1767225600000', orderId: 'GPA.1234', obfuscatedExternalAccountId: 'ABC' } },
      '/tokens/tok-1:acknowledge': { data: {} },
    });
    const v = new GoogleVerifier('com.trivia.torah', async () => http);
    const p = await v.verify({ productId: 'shekels_120', receipt: 'tok-1' });
    expect(p).toMatchObject({ transactionId: 'GPA.1234', productId: 'shekels_120', accountId: 'abc', environment: 'Production', revoked: false });
    await p.acknowledge!();
    expect(calls).toEqual([
      'GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.trivia.torah/purchases/products/shekels_120/tokens/tok-1',
      'POST https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.trivia.torah/purchases/products/shekels_120/tokens/tok-1:acknowledge',
    ]);
  });

  it('pendente, cancelada, inexistente e Google fora do ar', async () => {
    const { http } = play({
      '/tokens/pending': { data: { purchaseState: 2, purchaseTimeMillis: '1' } },
      '/tokens/canceled': { data: { purchaseState: 1, purchaseTimeMillis: '1' } },
      '/tokens/missing': { status: 404 },
      '/tokens/down': { status: 503 },
    });
    const v = new GoogleVerifier('com.trivia.torah', async () => http);
    const code = (p: Promise<unknown>) => p.then(() => null, (e: AppError) => e.code);
    expect(await code(v.verify({ productId: 'x', receipt: 'pending' }))).toBe('PURCHASE_PENDING');
    expect(await code(v.verify({ productId: 'x', receipt: 'canceled' }))).toBe('PURCHASE_INVALID');
    expect(await code(v.verify({ productId: 'x', receipt: 'missing' }))).toBe('PURCHASE_INVALID');
    expect(await code(v.verify({ productId: 'x', receipt: 'down' }))).toBe('STORE_UNAVAILABLE');
  });

  it('compra já confirmada não é confirmada de novo', async () => {
    const { http } = play({ '/tokens/t': { data: { purchaseState: 0, acknowledgementState: 1, purchaseTimeMillis: '5', orderId: 'GPA.9' } } });
    const p = await new GoogleVerifier('pkg', async () => http).verify({ productId: 'no_ads', receipt: 't' });
    expect(p.acknowledge).toBeUndefined();
  });
});

describe('demonstração e prêmios fixos', () => {
  it('a compra de demonstração só aceita um id de compra', async () => {
    const v = new DemoVerifier(() => new Date('2027-01-01T00:00:00Z'));
    await expect(v.verify({ productId: 'no_ads', receipt: 'qualquer coisa' })).rejects.toBeInstanceOf(AppError);
    const p = await v.verify({ productId: 'no_ads', receipt: '6F1C7D3E-1D0A-4A9B-9F8E-2B8C4B1A7E55' });
    expect(p.transactionId).toBe('demo:6f1c7d3e-1d0a-4a9b-9f8e-2b8c4b1a7e55');
  });

  it('o prêmio depende só da chave e do contexto', () => {
    const key = Buffer.from('chave-de-teste');
    expect(wheelPrize(key, 'turno-1')).toEqual(wheelPrize(key, 'turno-1'));
    expect(WHEEL_PRIZES.map((p) => p.prize)).toContainEqual(wheelPrize(key, 'turno-1'));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => JSON.stringify(wheelPrize(key, `turno-${i}`))));
    expect(seen.size).toBe(WHEEL_PRIZES.length);
    expect(giftPrize(key, 'u1', 'b1')).toEqual(giftPrize(key, 'u1', 'b1'));
    expect(wheelPrize(Buffer.from('outra-chave'), 'turno-1')).toBeDefined();
  });

  it('com as vidas cheias, nem o presente da pausa nem o prêmio da rodada é uma vida', () => {
    const key = Buffer.from('chave-de-teste');
    const kinds = (full: boolean) =>
      new Set(Array.from({ length: 300 }, (_, i) => [giftPrize(key, 'u1', `pausa-${i}`, full).kind, wheelPrize(key, `turno-${i}`, full).kind]).flat());
    expect(kinds(false).has('life')).toBe(true);
    expect(kinds(true).has('life')).toBe(false);
    // O resto da tabela continua saindo.
    expect(kinds(true)).toEqual(new Set(['coins', 'shekels', 'boost']));
  });
});

describe('configuração da economia', async () => {
  const { loadAppConfig } = await import('../src/config/app-config.js');
  const BASE = { DATABASE_URL: 'postgresql://x@localhost/x', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40) };
  const PROD = { ...BASE, NODE_ENV: 'production', CORS_ORIGINS: 'https://app.exemplo.com' };

  it('em desenvolvimento, anúncio e loja de demonstração; em produção, desligados', () => {
    expect(loadAppConfig({ ...BASE, NODE_ENV: 'development' }).economy).toMatchObject({ adsMode: 'demo', storeMode: 'demo' });
    expect(loadAppConfig(PROD).economy).toMatchObject({ adsMode: 'off', storeMode: 'off', apple: null, google: null });
  });

  it('produção nunca entrega prêmio ou compra sem a confirmação da loja ou do Google', () => {
    expect(() => loadAppConfig({ ...PROD, ADS_MODE: 'demo' })).toThrow(/ADS_MODE=demo/);
    expect(() => loadAppConfig({ ...PROD, ADS_MODE: 'trust-client' })).toThrow(/ADS_MODE=trust-client/);
    expect(() => loadAppConfig({ ...PROD, STORE_MODE: 'demo' })).toThrow(/STORE_MODE=demo/);
    expect(() => loadAppConfig({ ...PROD, STORE_MODE: 'live' })).toThrow(/ao menos uma loja/);
    expect(() => loadAppConfig({ ...PROD, APPLE_BUNDLE_ID: 'com.trivia.torah' })).toThrow(/APPLE_APP_ID/);
    expect(() => loadAppConfig({ ...PROD, GOOGLE_PLAY_PACKAGE_NAME: 'com.trivia.torah' })).toThrow(/SERVICE_ACCOUNT/);
    const live = loadAppConfig({ ...PROD, ADS_MODE: 'admob', APPLE_BUNDLE_ID: 'com.trivia.torah', APPLE_APP_ID: '1234567890' });
    expect(live.economy).toMatchObject({ adsMode: 'admob', storeMode: 'live', apple: { bundleId: 'com.trivia.torah', appAppleId: 1234567890 } });
  });

  it('a chave dos prêmios vem do segredo dos tokens e muda com ele', () => {
    const a = loadAppConfig({ ...BASE, NODE_ENV: 'development' }).economy.rewardsKey;
    const b = loadAppConfig({ ...BASE, NODE_ENV: 'development', JWT_ACCESS_SECRET: 'c'.repeat(40) }).economy.rewardsKey;
    expect(a.equals(b)).toBe(false);
    expect(a).toHaveLength(32);
  });
});
