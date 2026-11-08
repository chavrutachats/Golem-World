import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Errors, type AuthUser } from '../common/http.js';
import { TokensService } from './tokens.service.js';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}

export function bearerToken(request: RequestLike): string | null {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  const m = value ? /^Bearer\s+([A-Za-z0-9._~+/=-]{20,2048})$/i.exec(value.trim()) : null;
  return m ? m[1]! : null;
}

/**
 * Exige `Authorization: Bearer <accessToken>` válido e coloca o usuário em request.user.
 * O token é conferido também no banco (conta ativa, versão de sessão, papel atual).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(TokensService) private readonly tokens: TokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const token = bearerToken(request);
    if (!token) throw Errors.unauthorized();
    request.user = await this.tokens.verifyAccess(token);
    return true;
  }
}

/**
 * Revisão humana: só contas com papel de revisor ou admin, conferido no banco a cada
 * requisição (tirar o papel vale na hora). Use depois do AuthGuard.
 */
@Injectable()
export class ReviewerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<RequestLike>().user;
    if (!user) throw Errors.unauthorized();
    if (user.role !== 'reviewer' && user.role !== 'admin') {
      throw Errors.forbidden('Esta conta não tem permissão de revisão.');
    }
    return true;
  }
}
