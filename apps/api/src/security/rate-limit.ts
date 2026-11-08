/**
 * Limite de requisições em memória, com janela deslizante aproximada
 * (contagem da janela atual + parte proporcional da anterior), que evita a
 * rajada dobrada na virada de uma janela fixa.
 *
 * Fica num único processo. Com mais de uma instância da API, troque o
 * `RateLimitStore` por um que use Redis (veja docs/SECURITY.md).
 */
import { isIP } from 'node:net';

export interface RateLimitRule {
  /** Nome curto e único do limite (vai na chave e nos logs). */
  name: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Quanto falta para caber mais uma requisição, quando não coube. */
  retryAfterMs: number;
}

interface Bucket {
  windowStart: number;
  current: number;
  previous: number;
  limit: number;
  windowMs: number;
}

export interface RateLimitStore {
  /** Conta uma tentativa (se `consume`) e diz se ela cabe no limite. */
  hit(rule: RateLimitRule, key: string, now: number, consume?: boolean): RateLimitResult;
  /** Devolve uma tentativa já contada (ex.: login que deu certo). */
  refund(rule: RateLimitRule, key: string): void;
  reset(rule: RateLimitRule, key: string): void;
}

/** Teto de chaves na memória, para um ataque com milhões de IPs ou e-mails não esgotar a RAM. */
const MAX_KEYS = 200_000;
/** Quantas chaves, das menos usadas, examinar ao procurar uma para despejar. */
const EVICTION_SCAN = 1_000;

function estimate(bucket: Bucket, now: number): number {
  const windowStart = Math.floor(now / bucket.windowMs) * bucket.windowMs;
  if (windowStart - bucket.windowStart >= 2 * bucket.windowMs) return 0;
  if (windowStart !== bucket.windowStart) return bucket.current * (1 - (now - windowStart) / bucket.windowMs);
  return bucket.previous * (1 - (now - windowStart) / bucket.windowMs) + bucket.current;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  hit(rule: RateLimitRule, key: string, now: number, consume = true): RateLimitResult {
    const id = `${rule.name}|${key}`;
    let bucket = this.buckets.get(id);
    // Só conferir não cria chave: um ataque não enche a memória com consultas.
    if (!bucket && !consume) return { allowed: true, retryAfterMs: 0 };
    const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
    if (!bucket) {
      bucket = { windowStart, current: 0, previous: 0, limit: rule.limit, windowMs: rule.windowMs };
    } else if (bucket.windowStart !== windowStart) {
      const elapsedWindows = (windowStart - bucket.windowStart) / rule.windowMs;
      bucket = { ...bucket, windowStart, current: 0, previous: elapsedWindows === 1 ? bucket.current : 0 };
    }
    // Reinsere para manter a ordem de uso (as menos usadas ficam no começo do Map).
    this.buckets.delete(id);
    this.buckets.set(id, bucket);
    if (this.buckets.size > MAX_KEYS) this.evict(now);

    const weightPrevious = 1 - (now - windowStart) / rule.windowMs;
    const estimated = bucket.previous * weightPrevious + bucket.current;
    if (estimated + 1 > rule.limit) {
      // Tempo até a parte da janela anterior "escorrer" o suficiente (ou até a próxima janela).
      const overflow = estimated + 1 - rule.limit;
      const retryAfterMs =
        bucket.previous > 0 && overflow <= bucket.previous * weightPrevious
          ? Math.ceil((overflow / bucket.previous) * rule.windowMs)
          : windowStart + rule.windowMs - now;
      return { allowed: false, retryAfterMs: Math.max(1000, retryAfterMs) };
    }
    if (consume) bucket.current += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  /**
   * Despeja uma chave quando a memória enche. Prefere, entre as menos usadas, uma que
   * já venceu ou que está longe do limite; as que estão bloqueando alguém (por exemplo,
   * a conta sob força bruta) são as últimas a sair.
   */
  private evict(now: number): void {
    let scanned = 0;
    for (const [id, bucket] of this.buckets) {
      if (estimate(bucket, now) < bucket.limit / 2) {
        this.buckets.delete(id);
        return;
      }
      if (++scanned >= EVICTION_SCAN) break;
    }
    const oldest = this.buckets.keys().next().value;
    if (oldest !== undefined) this.buckets.delete(oldest);
  }

  refund(rule: RateLimitRule, key: string): void {
    const bucket = this.buckets.get(`${rule.name}|${key}`);
    if (!bucket) return;
    if (bucket.current > 0) bucket.current -= 1;
    else if (bucket.previous > 0) bucket.previous -= 1;
  }

  reset(rule: RateLimitRule, key: string): void {
    this.buckets.delete(`${rule.name}|${key}`);
  }

  /** Remove chaves paradas há mais de duas janelas do próprio limite. */
  sweep(now: number): void {
    for (const [id, bucket] of this.buckets) {
      if (now - bucket.windowStart > 2 * bucket.windowMs) this.buckets.delete(id);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Todos os limites da API num só lugar. Os de IP são generosos para não punir
 * uma sinagoga ou escola inteira atrás do mesmo Wi-Fi; os de conta e de e-mail
 * são os que barram força bruta.
 */
export const LIMITS = {
  /** Qualquer rota, por IP. */
  ipGlobal: { name: 'ip-global', limit: 600, windowMs: MINUTE },
  /** Criar convidado, por IP. */
  guestPerIp: { name: 'guest-ip', limit: 30, windowMs: HOUR },
  guestPerIpDaily: { name: 'guest-ip-day', limit: 150, windowMs: DAY },
  registerPerIp: { name: 'register-ip', limit: 10, windowMs: HOUR },
  loginPerIp: { name: 'login-ip', limit: 30, windowMs: 15 * MINUTE },
  /** Login social (Fase 10): cada tentativa consulta o provedor. */
  socialPerIp: { name: 'social-ip', limit: 60, windowMs: HOUR },
  refreshPerIp: { name: 'refresh-ip', limit: 300, windowMs: HOUR },
  /** Senha errada: por e-mail + IP (o jogador) e por e-mail de qualquer lugar (ataque distribuído). */
  loginFailuresPerAccountIp: { name: 'login-fail-acct-ip', limit: 5, windowMs: 15 * MINUTE },
  loginFailuresPerAccount: { name: 'login-fail-acct', limit: 30, windowMs: HOUR },
  /** Qualquer rota autenticada, por conta. A partida consulta o servidor a cada 4 s. */
  userGlobal: { name: 'user-global', limit: 300, windowMs: MINUTE },
  createGame: { name: 'create-game', limit: 30, windowMs: HOUR },
  rename: { name: 'rename', limit: 10, windowMs: HOUR },
  passwordChange: { name: 'password-change', limit: 5, windowMs: HOUR },
  accountDelete: { name: 'account-delete', limit: 5, windowMs: HOUR },
  logoutAll: { name: 'logout-all', limit: 10, windowMs: HOUR },
  report: { name: 'report', limit: 20, windowMs: DAY },
  /** Golem World: começar fase e comprar item. */
  journeyRun: { name: 'journey-run', limit: 120, windowMs: HOUR },
  /** O app consulta o preparo a cada segundo ou dois enquanto mostra "como jogar". */
  prepare: { name: 'prepare', limit: 900, windowMs: HOUR },
  shop: { name: 'shop', limit: 60, windowMs: HOUR },
  /** Fase 11: começar e terminar partidas do "Pedras do Choshen". */
  puzzleRun: { name: 'puzzle-run', limit: 240, windowMs: HOUR },
  /** Fase 9: compras na loja (inclui restaurar) e ofertas/resgates de anúncios com prêmio. */
  purchase: { name: 'purchase', limit: 30, windowMs: HOUR },
  rewards: { name: 'rewards', limit: 240, windowMs: HOUR },
  /** Confirmações do Google (SSV), por IP: vêm dos servidores do Google. */
  ssv: { name: 'ssv', limit: 1200, windowMs: MINUTE },
  /** Revisores aprovam em lote, então o limite é maior. */
  review: { name: 'review', limit: 600, windowMs: MINUTE },
} satisfies Record<string, RateLimitRule>;


/**
 * Chave do cliente a partir do IP. IPv6 é agrupado por /64, porque um único
 * cliente costuma controlar o /64 inteiro e trocaria de endereço a cada pedido.
 */
export function clientKey(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (isIP(ip) === 6) {
    const [head] = ip.split('%');
    const parts = expandIpv6(head!);
    return `${parts.slice(0, 4).join(':')}::/64`;
  }
  return ip;
}

function expandIpv6(ip: string): string[] {
  const [left, right] = ip.split('::') as [string, string | undefined];
  const l = left ? left.split(':') : [];
  const r = right !== undefined && right !== '' ? right.split(':') : [];
  const missing = right !== undefined ? 8 - l.length - r.length : 0;
  return [...l, ...Array<string>(Math.max(0, missing)).fill('0'), ...r].map((p) => p.toLowerCase().replace(/^0+(?=.)/, ''));
}
