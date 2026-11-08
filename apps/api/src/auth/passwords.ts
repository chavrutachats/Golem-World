/**
 * Hash de senha com scrypt (node:crypto), sem dependência nativa extra.
 * Formato guardado: scrypt$N$r$p$salt$hash (base64url).
 *
 * Parâmetros: N=2^15, r=8, p=3, uma das combinações recomendadas pelo OWASP
 * (Password Storage Cheat Sheet). Hashes com parâmetros antigos continuam valendo
 * e são refeitos com os atuais no próximo login certo (`needsRehash`).
 *
 * O scrypt é caro de propósito (~32 MB e dezenas de ms por senha). Para uma enxurrada
 * de logins não ocupar todas as threads do Node, no máximo `MAX_CONCURRENT_HASHES`
 * rodam ao mesmo tempo; o resto espera na fila.
 */
import { passwordProblem } from '@trivia/shared';
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { commonPasswords } from './common-passwords.js';

const PARAMS = { N: 2 ** 15, r: 8, p: 3, keylen: 64 };
const MAXMEM = 64 * 1024 * 1024;
/**
 * Limites ao verificar um hash guardado: memória (128·N·r bytes) até MAXMEM e custo
 * total limitado. Um hash adulterado no banco não consegue pedir memória ou CPU demais.
 */
const MAX_P = 16;
const MAX_COST = 2 ** 15 * 8 * MAX_P; // N·r·p
const MAX_CONCURRENT_HASHES = 2;

let running = 0;
const waiting: (() => void)[] = [];

async function withHashSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT_HASHES) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  withHashSlot(
    () =>
      new Promise<Buffer>((resolve, reject) =>
        scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
      ),
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, PARAMS.keylen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: MAXMEM,
  });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, keyB64] = stored.split('$');
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  if (!Number.isInteger(N) || N < 2 || (N & (N - 1)) !== 0) return false;
  if (!Number.isInteger(R) || R < 1 || !Number.isInteger(P) || P < 1 || P > MAX_P) return false;
  if (128 * N * R > MAXMEM || N * R * P > MAX_COST) return false;
  const expected = Buffer.from(keyB64, 'base64url');
  if (expected.length < 32 || expected.length > 128) return false;
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64url'), expected.length, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return timingSafeEqual(key, expected);
}

/** O hash guardado usa parâmetros mais fracos que os atuais? */
export function needsRehash(stored: string): boolean {
  const [algo, n, r, p] = stored.split('$');
  return algo !== 'scrypt' || Number(n) < PARAMS.N || Number(r) < PARAMS.r || Number(p) < PARAMS.p;
}

/**
 * Hash fixo, com os mesmos parâmetros dos reais, usado quando o e-mail não existe:
 * o login leva o mesmo tempo nos dois casos e não revela quais e-mails têm conta.
 */
export const DUMMY_HASH = ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, 'A'.repeat(22), 'A'.repeat(86)].join('$');

/**
 * Política completa de senha nova: as regras de @trivia/shared (tamanho, sequências,
 * dados da própria conta) + a lista de senhas comuns e vazadas.
 */
export function newPasswordProblem(password: string, context: { email?: string | null; displayName?: string | null }): string | null {
  const basic = passwordProblem(password, context);
  if (basic) return basic;
  const list = commonPasswords();
  const lower = password.normalize('NFKC').toLowerCase();
  const candidates = [
    lower,
    lower.replace(/[^\p{L}]+$/u, ''),
    lower.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''),
    lower.replace(/[\s._-]+/g, ''),
  ].filter((c) => c.length >= 6);
  if (candidates.some((c) => list.has(c))) {
    return 'Essa senha aparece em listas de senhas vazadas ou muito usadas. Escolha outra.';
  }
  return null;
}
