import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/app-config.js';
import { configureApp } from './security/http-hardening.js';
import { configureWeb } from './web/web-app.js';

/** Monta a aplicação Nest com todo o endurecimento HTTP (usado pelo servidor). */
export async function createApp(config: AppConfig, options: { logger?: false } = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    ...(options.logger === false ? { logger: false } : { logger: ['log', 'warn', 'error'] }),
    bodyParser: false,
  });
  configureApp(app, config);
  configureWeb(app, config.webDir);
  return app;
}
