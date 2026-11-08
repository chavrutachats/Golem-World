import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { Server } from 'node:http';
import { loadAppConfig } from './config/app-config.js';
import { createApp } from './create-app.js';

async function bootstrap() {
  const config = loadAppConfig();
  const app = await createApp(config);
  const server = app.getHttpServer() as Server;
  // Conexões lentas de propósito (slowloris) não seguram o servidor.
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  await (config.host ? app.listen(config.port, config.host) : app.listen(config.port));
  const log = new Logger('trivia-torah');
  log.log(`API em http://localhost:${config.port} — revisão de perguntas em http://localhost:${config.port}/admin`);
  if (config.production && config.trustProxy === false) {
    log.warn('TRUST_PROXY não definido. Se a API estiver atrás de um proxy reverso, defina TRUST_PROXY=1 para o limite de requisições ver o IP real.');
  }
  if (config.trustProxy !== false && !config.host) {
    log.warn(
      'TRUST_PROXY ligado com a API escutando em todas as interfaces: quem alcançar a porta direto pode forjar o IP (X-Forwarded-For). Use HOST=127.0.0.1 com o proxy na mesma máquina, ou um firewall que só deixe o proxy chegar.',
    );
  }
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
