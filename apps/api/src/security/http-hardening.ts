/**
 * Endurecimento HTTP aplicado a toda a API (servidor e testes usam o mesmo).
 *
 *  - Cabeçalhos de segurança (helmet): CSP que não carrega nada, sem iframe,
 *    sem "farejar" tipo de arquivo, sem Referer, HSTS em produção.
 *  - `Cache-Control: no-store`: respostas com tokens e dados pessoais não ficam
 *    em cache de navegador nem de proxy.
 *  - Corpo JSON de no máximo 16 KB (a maior entrada legítima tem ~2 KB).
 *  - IP real do cliente atrás de proxy reverso só quando TRUST_PROXY manda.
 *  - CORS só para as origens listadas, só com os métodos e cabeçalhos usados.
 */
import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { localeFromTag } from '@trivia/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppError, RateLimitedError } from '../common/http.js';
import type { AppConfig } from '../config/app-config.js';

export const JSON_BODY_LIMIT = '16kb';

export function configureApp(app: NestExpressApplication, config: AppConfig): NestExpressApplication {
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      strictTransportSecurity: config.production ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      xFrameOptions: { action: 'deny' },
    }),
  );
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  if (config.corsOrigins.length) {
    app.enableCors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'PATCH'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Accept-Language'],
      exposedHeaders: ['Retry-After', 'Content-Language'],
      maxAge: 600,
    });
  }
  app.enableShutdownHooks();
  return app;
}

/**
 * Erros de regra de negócio no idioma de quem pediu (Accept-Language; o app manda o
 * idioma escolhido pelo jogador) e, nas respostas 429, o cabeçalho `Retry-After`
 * para o app saber quanto esperar.
 */
@Catch(AppError)
export class AppErrorFilter implements ExceptionFilter {
  catch(exception: AppError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const header = req.headers['accept-language'];
    const locale = localeFromTag(Array.isArray(header) ? header[0] : header);
    if (exception instanceof RateLimitedError) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(exception.retryAfterMs / 1000))));
    }
    res.setHeader('Content-Language', locale);
    res.status(exception.getStatus()).json(exception.bodyFor(locale));
  }
}
