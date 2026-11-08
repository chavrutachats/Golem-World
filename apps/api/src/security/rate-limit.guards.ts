/**
 * Onde os limites entram no ciclo da requisição:
 *
 *  1. `IpRateLimitGuard` (guard global) roda antes de tudo, inclusive da
 *     autenticação: limite geral por IP + os de `@IpLimit` da rota. É ele que
 *     protege login e cadastro antes do custo do hash de senha.
 *  2. `UserRateLimitInterceptor` (global) roda depois dos guards, quando já se sabe
 *     quem é o usuário: limite geral por conta + os de `@UserLimit` da rota.
 */
import {
  Inject,
  Injectable,
  SetMetadata,
  type CallHandler,
  type CanActivate,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import type { AuthUser } from '../common/http.js';
import { clientKey, LIMITS, type RateLimitRule } from './rate-limit.js';
import { RateLimitService } from './rate-limit.service.js';

const IP_LIMITS = 'trivia:ip-limits';
const USER_LIMITS = 'trivia:user-limits';

/** Limites extras por IP para esta rota (além do geral). */
export const IpLimit = (...rules: RateLimitRule[]) => SetMetadata(IP_LIMITS, rules);
/** Limites extras por conta para esta rota (além do geral). Exige rota autenticada. */
export const UserLimit = (...rules: RateLimitRule[]) => SetMetadata(USER_LIMITS, rules);

interface RequestLike {
  ip?: string;
  user?: AuthUser;
}

export function requestClientKey(request: RequestLike): string {
  return clientKey(request.ip);
}

@Injectable()
export class IpRateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http' || !this.limits.enabled) return true;
    const request = context.switchToHttp().getRequest<RequestLike>();
    const key = requestClientKey(request);
    this.limits.consume(LIMITS.ipGlobal, `ip:${key}`, 'Muitas requisições deste endereço.');
    const rules = this.reflector.getAllAndMerge<RateLimitRule[]>(IP_LIMITS, [context.getHandler(), context.getClass()]) ?? [];
    for (const rule of rules) this.limits.consume(rule, `ip:${key}`);
    return true;
  }
}

@Injectable()
export class UserRateLimitInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http' && this.limits.enabled) {
      const user = context.switchToHttp().getRequest<RequestLike>().user;
      if (user) {
        this.limits.consume(LIMITS.userGlobal, `user:${user.id}`, 'Muitas requisições desta conta.');
        const rules = this.reflector.getAllAndMerge<RateLimitRule[]>(USER_LIMITS, [context.getHandler(), context.getClass()]) ?? [];
        for (const rule of rules) this.limits.consume(rule, `user:${user.id}`);
      }
    }
    return next.handle();
  }
}
