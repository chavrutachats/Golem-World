import { describe, expect, it } from 'vitest';
import { DUMMY_HASH, hashPassword, needsRehash, newPasswordProblem, verifyPassword } from '../src/auth/passwords.js';
import { isPlaceholderSecret, loadAppConfig } from '../src/config/app-config.js';
import { retryAfterText } from '@trivia/shared';
import { clientKey, MemoryRateLimitStore } from '../src/security/rate-limit.js';

const BASE_ENV = {
  DATABASE_URL: 'postgresql://x@localhost/x',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  NODE_ENV: 'development',
};

describe('limite de requisições (janela deslizante)', () => {
  const rule = { name: 't', limit: 3, windowMs: 60_000 };

  it('bloqueia depois do limite e libera com o tempo', () => {
    const store = new MemoryRateLimitStore();
    const t0 = 1_000_000_020_000;
    for (let i = 0; i < 3; i++) expect(store.hit(rule, 'k', t0 + i).allowed).toBe(true);
    const blocked = store.hit(rule, 'k', t0 + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    // Logo na virada da janela, a janela anterior ainda pesa: continua bloqueado.
    expect(store.hit(rule, 'k', t0 + 60_000).allowed).toBe(false);
    // Duas janelas depois, livre.
    expect(store.hit(rule, 'k', t0 + 130_000).allowed).toBe(true);
  });

  it('chaves diferentes não se misturam; conferir sem contar não gasta tentativa', () => {
    const store = new MemoryRateLimitStore();
    const t = 5_000_000_000_000;
    for (let i = 0; i < 3; i++) store.hit(rule, 'a', t);
    expect(store.hit(rule, 'b', t).allowed).toBe(true);
    for (let i = 0; i < 10; i++) expect(store.hit(rule, 'c', t, false).allowed).toBe(true);
    store.reset(rule, 'a');
    expect(store.hit(rule, 'a', t).allowed).toBe(true);
  });

  it('limpa chaves paradas e não cria chave só para conferir', () => {
    const store = new MemoryRateLimitStore();
    store.hit(rule, 'x', 0);
    store.sweep(10 * 60_000);
    expect(store.size).toBe(0);
    store.hit(rule, 'y', 0, false);
    expect(store.size).toBe(0);
  });

  it('devolver uma tentativa libera espaço no limite', () => {
    const store = new MemoryRateLimitStore();
    const t = 7_000_000_000_000;
    for (let i = 0; i < 3; i++) store.hit(rule, 'r', t);
    expect(store.hit(rule, 'r', t).allowed).toBe(false);
    store.refund(rule, 'r');
    expect(store.hit(rule, 'r', t).allowed).toBe(true);
  });

  it('agrupa IPv6 por /64 e trata IPv4 mapeado', () => {
    expect(clientKey('::ffff:192.0.2.7')).toBe('192.0.2.7');
    expect(clientKey('2001:db8:abcd:12::1')).toBe(clientKey('2001:db8:abcd:12:ffff:ffff:ffff:ffff'));
    expect(clientKey('2001:db8:abcd:12::1')).not.toBe(clientKey('2001:db8:abcd:13::1'));
    expect(clientKey(undefined)).toBe('unknown');
  });

  it('escreve o tempo de espera para pessoas', () => {
    expect(retryAfterText(30_000, 'pt')).toBe('Tente de novo em 1 minuto.');
    expect(retryAfterText(14 * 60_000, 'pt')).toBe('Tente de novo em 14 minutos.');
    expect(retryAfterText(23 * 3_600_000, 'pt')).toBe('Tente de novo em 23 horas.');
    expect(retryAfterText(14 * 60_000, 'en')).toBe('Try again in 14 minutes.');
    expect(retryAfterText(60 * 60_000, 'he')).toBe('נסו שוב בעוד שעה.');
  });
});

describe('senhas no servidor', () => {
  it('verifica a senha certa e recusa a errada e hashes adulterados', async () => {
    const hash = await hashPassword('menorá de sete braços');
    expect(await verifyPassword('menorá de sete braços', hash)).toBe(true);
    expect(await verifyPassword('menora de sete bracos', hash)).toBe(false);
    expect(await verifyPassword('x', DUMMY_HASH)).toBe(false);
    // Parâmetros absurdos (pediriam memória demais) são recusados sem calcular.
    expect(await verifyPassword('x', 'scrypt$1048576$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86))).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$whatever')).toBe(false);
  });

  it('sabe quando um hash precisa ser refeito', async () => {
    expect(needsRehash(await hashPassword('menorá de sete braços'))).toBe(false);
    expect(needsRehash('scrypt$32768$8$1$AAAA$AAAA')).toBe(true);
  });

  it('recusa senhas vazadas, inclusive com números no fim', () => {
    expect(newPasswordProblem('password1234', {})).toMatch(/fácil de adivinhar/);
    expect(newPasswordProblem('iloveyou2026!!', {})).toMatch(/vazadas/);
    expect(newPasswordProblem('qwertyuiop123', {})).toMatch(/vazadas/);
    expect(newPasswordProblem('figueira-de-jerico-3', {})).toBeNull();
  });
});

describe('configuração', () => {
  it('nunca aceita os segredos de exemplo, nem em desenvolvimento', () => {
    expect(isPlaceholderSecret('troque-por-um-segredo-longo-e-aleatorio')).toBe(true);
    expect(() => loadAppConfig({ ...BASE_ENV, JWT_ACCESS_SECRET: 'troque-por-um-segredo-longo-e-aleatorio' })).toThrow(/secrets:init/);
  });

  it('exige segredos diferentes', () => {
    expect(() => loadAppConfig({ ...BASE_ENV, JWT_REFRESH_SECRET: BASE_ENV.JWT_ACCESS_SECRET })).toThrow(/diferentes/);
  });

  it('sem NODE_ENV, valem as regras de produção: CORS só https e limite de requisições ligado', () => {
    const { NODE_ENV: _, ...prod } = BASE_ENV;
    expect(() => loadAppConfig({ ...prod, CORS_ORIGINS: 'http://localhost:8081' })).toThrow(/https/);
    expect(() => loadAppConfig({ ...prod, RATE_LIMIT_ENABLED: 'false' })).toThrow(/testes/);
    expect(loadAppConfig({ ...prod, CORS_ORIGINS: 'https://app.exemplo.com' }).production).toBe(true);
    expect(loadAppConfig(BASE_ENV).production).toBe(false);
  });

  it('TRUST_PROXY aceita número de proxies, mas não "true"', () => {
    expect(loadAppConfig({ ...BASE_ENV, TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(loadAppConfig(BASE_ENV).trustProxy).toBe(false);
    expect(() => loadAppConfig({ ...BASE_ENV, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    expect(() => loadAppConfig({ ...BASE_ENV, TRUST_PROXY: '0.0.0.0/0' })).toThrow(/TRUST_PROXY/);
    expect(() => loadAppConfig({ ...BASE_ENV, TRUST_PROXY: '10.0.0.1, ::/0' })).toThrow(/TRUST_PROXY/);
    expect(loadAppConfig({ ...BASE_ENV, TRUST_PROXY: '10.0.0.0/8' }).trustProxy).toBe('10.0.0.0/8');
  });
});
