/**
 * Utilidades HTTP: validação com Zod, erros com código estável para o app,
 * e o decorator que expõe o usuário autenticado.
 */
import { createParamDecorator, HttpException, type ExecutionContext, type PipeTransform } from '@nestjs/common';
import { messageText, retryAfterText, type Locale, type MessageParams } from '@trivia/shared';
import type { z } from 'zod';

/** Valida o corpo/consulta com um schema Zod (os mesmos de @trivia/shared). */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const parsed = this.schema.safeParse(value ?? {});
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_INPUT', 'Dados inválidos.', undefined, {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return parsed.data;
  }
}

/**
 * Erro de regra de negócio com código estável (o app decide o que fazer pelo `code`,
 * não pelo texto da mensagem).
 *
 * `template` é a frase em português de @trivia/shared/messages, com `{param}` para as
 * partes variáveis; o filtro global a escreve no idioma de quem pediu
 * (Accept-Language). Um teste confere que toda frase usada aqui está traduzida.
 */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    readonly template: string,
    readonly params?: MessageParams,
    readonly extra?: Readonly<Record<string, unknown>>,
  ) {
    super({ code, message: messageText(template, 'pt', params), ...extra }, status);
  }

  /** Corpo da resposta no idioma pedido. */
  bodyFor(locale: Locale): Record<string, unknown> {
    const body: Record<string, unknown> = { code: this.code, message: messageText(this.template, locale, this.params), ...this.extra };
    const issues = this.extra?.issues;
    if (Array.isArray(issues)) {
      body.issues = (issues as { path: string; message: string }[]).map((i) => ({ path: i.path, message: messageText(i.message, locale) }));
    }
    return body;
  }
}

/** 429 com o tempo de espera; o filtro global transforma isso no header Retry-After. */
export class RateLimitedError extends AppError {
  constructor(
    readonly retryAfterMs: number,
    reason: string,
    /** Frase própria no lugar do "Tente de novo em …" calculado. */
    readonly ownRetryText = false,
  ) {
    super(429, 'RATE_LIMITED', reason);
  }

  override bodyFor(locale: Locale): Record<string, unknown> {
    const body = super.bodyFor(locale);
    if (!this.ownRetryText) body.message = `${String(body.message)} ${retryAfterText(this.retryAfterMs, locale)}`;
    return body;
  }
}

export const Errors = {
  notFound: (message = 'Recurso não encontrado.') => new AppError(404, 'NOT_FOUND', message),
  forbidden: (message = 'Acesso negado.') => new AppError(403, 'FORBIDDEN', message),
  unauthorized: (message = 'Faça login novamente.') => new AppError(401, 'UNAUTHORIZED', message),
  conflict: (code: string, message: string, params?: MessageParams) => new AppError(409, code, message, params),
  unprocessable: (code: string, message: string, params?: MessageParams) => new AppError(422, code, message, params),
  /** Um serviço de fora (loja, Google) não respondeu: dá para tentar de novo. */
  unavailable: (code: string, message: string) => new AppError(503, code, message),
  /** `reason` é a causa ("Muitas tentativas seguidas."); o tempo de espera é acrescentado no idioma certo. */
  rateLimited: (retryAfterMs: number, reason: string) => new RateLimitedError(retryAfterMs, reason),
  /** Para quando a frase já diz quando tentar de novo. */
  rateLimitedUntil: (retryAfterMs: number, message: string) => new RateLimitedError(retryAfterMs, message, true),
};

export interface AuthUser {
  id: string;
  role: 'player' | 'reviewer' | 'admin';
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!request.user) throw Errors.unauthorized();
  return request.user;
});
