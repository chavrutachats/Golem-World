import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Errors } from '../common/http.js';
import { CLOCK, type Clock } from '../common/infra.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { MemoryRateLimitStore, type RateLimitRule, type RateLimitStore } from './rate-limit.js';

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly log = new Logger('security');
  private readonly lastLogged = new Map<string, number>();
  private readonly sweeper: NodeJS.Timeout | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
  ) {
    if (config.rateLimitEnabled && store instanceof MemoryRateLimitStore) {
      this.sweeper = setInterval(() => store.sweep(Date.now()), 10 * 60_000);
      this.sweeper.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  get enabled(): boolean {
    return this.config.rateLimitEnabled;
  }

  /** Conta uma tentativa; se passar do limite, responde 429. */
  consume(rule: RateLimitRule, key: string, message = 'Muitas tentativas seguidas.'): void {
    this.check(rule, key, message);
  }

  /** Devolve uma tentativa contada (ex.: o login deu certo). */
  refund(rule: RateLimitRule, key: string): void {
    if (!this.enabled) return;
    this.store.refund(rule, key);
  }

  reset(rule: RateLimitRule, key: string): void {
    this.store.reset(rule, key);
  }

  private check(rule: RateLimitRule, key: string, message: string): void {
    if (!this.enabled) return;
    const now = this.clock.now().getTime();
    const result = this.store.hit(rule, key, now);
    if (result.allowed) return;
    this.logBlock(rule, key, now);
    throw Errors.rateLimited(result.retryAfterMs, message);
  }

  /** Registra o bloqueio uma vez por minuto por chave, para o log não virar arma num ataque. */
  private logBlock(rule: RateLimitRule, key: string, now: number): void {
    const id = `${rule.name}|${key}`;
    const last = this.lastLogged.get(id) ?? 0;
    if (now - last < 60_000) return;
    if (this.lastLogged.size > 10_000) this.lastLogged.clear();
    this.lastLogged.set(id, now);
    this.log.warn(`limite "${rule.name}" atingido por ${key}`);
  }
}
