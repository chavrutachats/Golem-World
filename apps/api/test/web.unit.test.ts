/**
 * Versão web servida pela API (pnpm lan): página e API no mesmo endereço.
 */
import 'reflect-metadata';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureWeb, prepareIndexHtml, webCsp } from '../src/web/web-app.js';

@Controller('journey')
class JourneyStub {
  @Get()
  state() {
    return { ok: 'api' };
  }
}

@Controller('admin')
class AdminStub {
  @Get()
  page() {
    return 'painel';
  }
}

@Module({ controllers: [JourneyStub, AdminStub] })
class StubModule {}

const INDEX = '<!doctype html><html><head><title>Trivia</title><script>window.__x=1</script></head><body><div id="root"></div><script src="/_expo/static/js/web/entry-abc.js"></script></body></html>';

describe('versão web servida pela API', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'trivia-web-'));
    writeFileSync(path.join(dir, 'index.html'), INDEX);
    mkdirSync(path.join(dir, '_expo/static/js/web'), { recursive: true });
    writeFileSync(path.join(dir, '_expo/static/js/web/entry-abc.js'), 'console.log(1)');
    mkdirSync(path.join(dir, 'assets/__node_modules/.pnpm/font'), { recursive: true });
    writeFileSync(path.join(dir, 'assets/__node_modules/.pnpm/font/Rubik.ttf'), 'ttf');
    app = await NestFactory.create<NestExpressApplication>(StubModule, { logger: false });
    configureWeb(app, dir);
    await app.init();
  });

  afterAll(() => app?.close());

  it('navegação recebe o app, com a API apontada para /api e CSP de página', async () => {
    const res = await request(app.getHttpServer()).get('/journey').set('Accept', 'text/html,*/*').expect(200);
    expect(res.text).toContain('<meta name="trivia-api" content="/api">');
    expect(res.text).toContain('rel="manifest"');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    // O script inline do index só roda pelo hash.
    expect(res.headers['content-security-policy']).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('/index.html é a mesma página do app, não o arquivo cru', async () => {
    const res = await request(app.getHttpServer()).get('/index.html?x=1').expect(200);
    expect(res.text).toContain('<meta name="trivia-api" content="/api">');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['origin-agent-cluster']).toBeUndefined();
  });

  it('a mesma rota pedida pelo app (JSON) ou por /api é a API', async () => {
    await request(app.getHttpServer()).get('/journey').set('Accept', 'application/json').expect(200, { ok: 'api' });
    await request(app.getHttpServer()).get('/api/journey').set('Accept', 'text/html').expect(200, { ok: 'api' });
  });

  it('páginas do servidor continuam do servidor', async () => {
    const res = await request(app.getHttpServer()).get('/admin').set('Accept', 'text/html');
    expect(res.text).toBe('painel');
  });

  it('arquivos com hash ficam em cache; fontes em pastas .pnpm são servidas', async () => {
    const js = await request(app.getHttpServer()).get('/_expo/static/js/web/entry-abc.js').expect(200);
    expect(js.headers['cache-control']).toContain('immutable');
    await request(app.getHttpServer()).get('/assets/__node_modules/.pnpm/font/Rubik.ttf').expect(200);
  });

  it('CSP e marcas do <head>', () => {
    expect(prepareIndexHtml('<head></head>')).toContain('<meta name="trivia-api" content="/api"></head>'.slice(0, 20));
    expect(webCsp('<script src="/a.js"></script>')).toContain("script-src 'self';");
    // O cliente Godot compila WebAssembly; eval de JavaScript continua fora.
    expect(webCsp('<script src="/a.js"></script>', { wasm: true })).toContain("script-src 'self' 'wasm-unsafe-eval';");
    expect(webCsp('<script src="/a.js"></script>', { wasm: true })).not.toContain("'unsafe-eval'");
  });

  it('ids públicos dos logins sociais vão no <head> (para o cliente Godot); nada sem configurar', () => {
    const html = prepareIndexHtml('<head></head>', { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: '123-abc.apps.googleusercontent.com', FACEBOOK_APP_ID: '987654' });
    expect(html).toContain('<meta name="trivia-google-client" content="123-abc.apps.googleusercontent.com">');
    expect(html).toContain('<meta name="trivia-facebook-app" content="987654">');
    expect(prepareIndexHtml('<head></head>', {})).not.toContain('trivia-google-client');
    // Nada de aspas ou tags vindas do ambiente.
    expect(prepareIndexHtml('<head></head>', { FACEBOOK_APP_ID: '1"><script>' })).not.toContain('<script>');
  });
});
