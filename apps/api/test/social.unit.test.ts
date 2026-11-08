/**
 * Conferência dos logins sociais com chaves geradas aqui (o mesmo formato das chaves
 * públicas do Google e da Apple), sem rede.
 */
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '../src/common/http.js';
import { AppleVerifier, FacebookVerifier, GoogleVerifier, sha256Hex } from '../src/auth/social/verifiers.js';

let sign: (claims: Record<string, unknown>, opts?: { kid?: string; exp?: string }) => Promise<string>;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  jwks = createLocalJWKSet({ keys: [jwk] });
  sign = (claims, opts = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? 'k1' })
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '10m')
      .sign(privateKey);
});

const code = (p: Promise<unknown>) => p.then(() => null, (e: AppError) => e.code);

describe('Google', () => {
  const google = () => new GoogleVerifier(['web.apps.googleusercontent.com', 'ios.apps.googleusercontent.com'], jwks);
  const base = { iss: 'https://accounts.google.com', aud: 'web.apps.googleusercontent.com', sub: '1122', email: 'Shimon@Exemplo.com', email_verified: true, name: 'Shimon Pires' };

  it('aceita o token do app e devolve o perfil', async () => {
    const p = await google().verify({ token: await sign(base) });
    expect(p).toEqual({ subject: '1122', email: 'shimon@exemplo.com', name: 'Shimon Pires' });
  });

  it('recusa token de outro app, vencido, de outro emissor ou com nonce errado', async () => {
    expect(await code(google().verify({ token: await sign({ ...base, aud: 'outro-app' }) }))).toBe('SOCIAL_INVALID');
    expect(await code(google().verify({ token: await sign(base, { exp: '-10m' }) }))).toBe('SOCIAL_INVALID');
    expect(await code(google().verify({ token: await sign({ ...base, iss: 'https://evil.example' }) }))).toBe('SOCIAL_INVALID');
    expect(await code(google().verify({ token: await sign(base, { kid: 'outra-chave' }) }))).toBe('SOCIAL_INVALID');
    const withNonce = await sign({ ...base, nonce: sha256Hex('nonce-original-123456') });
    expect(await code(google().verify({ token: withNonce, nonce: 'outro-nonce-1234567' }))).toBe('SOCIAL_INVALID');
    await expect(google().verify({ token: withNonce, nonce: 'nonce-original-123456' })).resolves.toMatchObject({ subject: '1122' });
  });

  it('e-mail não confirmado não conta', async () => {
    const p = await google().verify({ token: await sign({ ...base, email_verified: false }) });
    expect(p.email).toBeNull();
  });
});

describe('Apple', () => {
  const apple = () => new AppleVerifier(['app.triviatora.mobile'], jwks);
  const base = { iss: 'https://appleid.apple.com', aud: 'app.triviatora.mobile', sub: '001234.abcd', email: 'x@privaterelay.appleid.com', email_verified: 'true' };

  it('exige o nonce e o confere', async () => {
    const raw = 'nonce-da-apple-0123456789';
    const token = await sign({ ...base, nonce: sha256Hex(raw) });
    await expect(apple().verify({ token, nonce: raw })).resolves.toEqual({ subject: '001234.abcd', email: 'x@privaterelay.appleid.com', name: null });
    expect(await code(apple().verify({ token }))).toBe('SOCIAL_INVALID');
    expect(await code(apple().verify({ token: await sign(base), nonce: raw }))).toBe('SOCIAL_INVALID');
  });
});

describe('Facebook', () => {
  function graph(debug: unknown, me: unknown, status = 200) {
    const calls: string[] = [];
    const fetchJson = async (url: string) => {
      calls.push(url);
      const body = url.includes('/debug_token') ? debug : me;
      return { ok: status < 400, status, json: async () => body };
    };
    return { calls, verifier: new FacebookVerifier('424242', 'segredo', fetchJson) };
  }

  it('confere que o token foi feito para este app', async () => {
    const ok = graph({ data: { is_valid: true, app_id: '424242', user_id: '77' } }, { id: '77', name: 'Miriam', email: 'm@x.com' });
    await expect(ok.verifier.verify({ token: 'EAAB-token-valido-123' })).resolves.toEqual({ subject: '77', email: 'm@x.com', name: 'Miriam' });
    expect(ok.calls[0]).toContain('access_token=424242%7Csegredo');
    const other = graph({ data: { is_valid: true, app_id: '999', user_id: '77' } }, { id: '77' });
    expect(await code(other.verifier.verify({ token: 'EAAB-token-de-outro-app' }))).toBe('SOCIAL_INVALID');
    const expired = graph({ data: { is_valid: false } }, {});
    expect(await code(expired.verifier.verify({ token: 'EAAB-token-vencido-123' }))).toBe('SOCIAL_INVALID');
    const down = graph({}, {}, 503);
    expect(await code(down.verifier.verify({ token: 'EAAB-qualquer-123456' }))).toBe('SOCIAL_UNAVAILABLE');
  });
});
