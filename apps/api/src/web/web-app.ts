/**
 * A versão web do jogo servida pela própria API (WEB_DIR).
 *
 * Assim o jogo abre no navegador de qualquer aparelho da rede, sem instalar nada:
 * página e API saem do mesmo endereço (http://<ip-do-computador>:3000), então não há
 * CORS para configurar nem porta do Metro para liberar no firewall.
 *
 * - /api/... é a mesma API das rotas sem prefixo (o app web usa /api; o app do celular
 *   continua usando a raiz).
 * - Arquivos da exportação web (JS, fontes, imagens, sons) com cache longo quando o
 *   nome tem hash.
 * - Navegação do navegador (GET pedindo HTML) recebe o index.html do app, com uma CSP
 *   própria para páginas (a da API não deixa carregar nada). Ficam de fora as páginas
 *   do servidor: /admin, /conta e /health.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

export const API_PREFIX = '/api';
/** Páginas HTML que a própria API serve (não são do app). */
const SERVER_PAGES = ['/admin', '/conta', '/health'];

/** Marcas acrescentadas ao <head>: onde está a API, manifesto e ícone para "adicionar à tela inicial". */
const HEAD_TAGS = [
  `<meta name="trivia-api" content="${API_PREFIX}">`,
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<meta name="theme-color" content="#14205C">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<link rel="apple-touch-icon" href="/icon-192.png">',
].join('');

function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]!)
    .filter((code) => code.trim().length > 0)
    .map((code) => `'sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}'`);
}

/**
 * CSP das páginas do app: tudo do próprio endereço; scripts inline só pelo hash.
 * `wasm`: o cliente Godot (Fase 14) roda em WebAssembly, que pede 'wasm-unsafe-eval'
 * (só compilar WebAssembly; eval de JavaScript continua proibido).
 */
export function webCsp(html: string, { wasm = false }: { wasm?: boolean } = {}): string {
  return [
    "default-src 'self'",
    `script-src 'self'${wasm ? " 'wasm-unsafe-eval'" : ''} ${inlineScriptHashes(html).join(' ')}`.trim(),
    // react-native-web injeta as folhas de estilo em <style>.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Ids públicos dos logins sociais para o cliente Godot, que não tem variáveis de build
 * como o app (EXPO_PUBLIC_…): o id do cliente web do Google e o número do app no Meta.
 * Os dois são públicos (vão na URL de login de qualquer jeito); segredos nunca entram aqui.
 */
function socialTags(env: NodeJS.ProcessEnv = process.env): string {
  const attr = (v: string) => v.replace(/[^A-Za-z0-9._-]/g, '');
  const google = attr(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? '');
  const facebook = attr(env.EXPO_PUBLIC_FACEBOOK_APP_ID?.trim() || env.FACEBOOK_APP_ID?.trim() || '');
  return (google ? `<meta name="trivia-google-client" content="${google}">` : '') + (facebook ? `<meta name="trivia-facebook-app" content="${facebook}">` : '');
}

export function prepareIndexHtml(raw: string, env: NodeJS.ProcessEnv = process.env): string {
  const tags = HEAD_TAGS + socialTags(env);
  return raw.includes('</head>') ? raw.replace('</head>', `${tags}</head>`) : `${tags}${raw}`;
}

function isRead(req: Request): boolean {
  return req.method === 'GET' || req.method === 'HEAD';
}

function isServerPage(p: string): boolean {
  return SERVER_PAGES.some((page) => p === page || p.startsWith(`${page}/`));
}

/** Liga o prefixo /api (sempre) e, com WEB_DIR, a versão web do jogo. */
export function configureWeb(app: NestExpressApplication, webDir: string | null): void {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.url === API_PREFIX || req.url.startsWith(`${API_PREFIX}/`) || req.url.startsWith(`${API_PREFIX}?`)) {
      req.url = req.url.slice(API_PREFIX.length) || '/';
      // Marca para a navegação do app não engolir a chamada da API.
      (req as Request & { viaApiPrefix?: boolean }).viaApiPrefix = true;
    }
    next();
  });
  if (!webDir) return;

  const indexFile = path.join(webDir, 'index.html');
  if (!existsSync(indexFile)) {
    throw new Error(`WEB_DIR=${webDir} não tem index.html. Gere a versão web com "pnpm --filter @trivia/mobile export:web".`);
  }
  const html = prepareIndexHtml(readFileSync(indexFile, 'utf8'));
  const csp = webCsp(html, { wasm: existsSync(path.join(webDir, 'index.wasm')) });

  const sendPage = (req: Request, res: Response): void => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Cache-Control', 'no-cache');
    // Em http na rede de casa o navegador ignora (e reclama de) COOP e Origin-Agent-Cluster; em https eles valem.
    if (!req.secure) {
      res.removeHeader('Cross-Origin-Opener-Policy');
      res.removeHeader('Origin-Agent-Cluster');
    }
    res.type('html').send(html);
  };

  // /index.html é a página do app como qualquer rota (CSP de página e marcas do <head>), nunca o arquivo cru.
  app.use((req: Request & { viaApiPrefix?: boolean }, res: Response, next: NextFunction) => {
    if (isRead(req) && !req.viaApiPrefix && req.path === '/index.html') return sendPage(req, res);
    next();
  });

  app.useStaticAssets(webDir, {
    index: false,
    // A exportação do Expo guarda fontes em assets/__node_modules/.pnpm/…: pastas com
    // ponto são legítimas aqui (a pasta só tem a saída da exportação, nada secreto).
    dotfiles: 'allow',
    fallthrough: true,
    setHeaders: (res, file) => {
      const hashed = /[\\/]_expo[\\/]static[\\/]/.test(file) || /[.-][0-9a-f]{16,}\./i.test(path.basename(file));
      // A exportação do Godot não põe hash nos nomes (index.pck, index.wasm…): o navegador confere a cada abertura.
      const godotBuild = /^index\.(pck|wasm|js|audio\.worklet\.js|audio\.position\.worklet\.js)$/.test(path.basename(file));
      res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : godotBuild ? 'no-cache' : 'public, max-age=3600');
    },
  });

  app.use((req: Request & { viaApiPrefix?: boolean }, res: Response, next: NextFunction) => {
    const wantsPage = isRead(req) && !req.viaApiPrefix && (req.headers.accept ?? '').includes('text/html');
    if (!wantsPage || isServerPage(req.path) || path.extname(req.path)) return next();
    sendPage(req, res);
  });
}
