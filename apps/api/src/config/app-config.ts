/**
 * Configuração da API, lida do `.env` da raiz do monorepo e validada com Zod.
 * Variável inválida derruba o processo na inicialização, com mensagem clara.
 */
import { config as loadEnv } from 'dotenv';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/** "15m", "30d", "3600s", "12h" → segundos. */
export function parseDuration(value: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!m) throw new Error(`Duração inválida: "${value}" (use 15m, 12h, 30d…)`);
  const n = Number(m[1]);
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
}

const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

const bool = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => ['1', 'true', 'yes', 'sim', 'on'].includes(v));

/**
 * TRUST_PROXY: quantos proxies reversos (nginx, Render, Fly…) ficam na frente da API.
 * Define de onde vem o IP do cliente, usado no limite de requisições.
 * "false" (padrão) = API exposta direto; "1" = um proxy; "loopback" ou lista de IPs/CIDR.
 */
const TrustProxy = z
  .string()
  .trim()
  .default('false')
  .transform((v, ctx): boolean | number | string => {
    if (v === '' || v === 'false' || v === '0') return false;
    if (/^\d+$/.test(v)) return Number(v);
    if (v === 'true' || /(^|,)\s*(0\.0\.0\.0|::)\/0\s*(,|$)/.test(v)) {
      ctx.addIssue({ code: 'custom', message: 'TRUST_PROXY assim confia em qualquer cliente; informe o número de proxies (ex.: 1) ou o IP do proxy.' });
      return z.NEVER;
    }
    return v;
  });

const EnvSchema = z.object({
  NODE_ENV: z.string().trim().default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /**
   * Interface de rede onde a API escuta. Vazio = todas (preciso em desenvolvimento, para o
   * celular na mesma rede alcançar a API). Atrás de um proxy na mesma máquina, use
   * 127.0.0.1: assim ninguém fala direto com a API e forja o X-Forwarded-For.
   */
  HOST: z.string().trim().default(''),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET precisa de ao menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET precisa de ao menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m').transform(parseDuration),
  JWT_REFRESH_TTL: z.string().default('30d').transform(parseDuration),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  RANKING_TIMEZONE: z.string().default('America/Sao_Paulo'),
  TRUST_PROXY: TrustProxy,
  /** Só para testes automatizados: desliga o limite de requisições. */
  RATE_LIMIT_ENABLED: bool.default(true),
  /** Limpeza periódica (tokens vencidos, convidados abandonados, convites parados). */
  MAINTENANCE_ENABLED: bool.default(true),
  /** Bots no modo aleatório quando não há ninguém na fila. */
  BOTS_ENABLED: bool.default(true),
  /**
   * Tradução automática dos textos (Fase 8): anthropic, fake (só desenvolvimento) ou off.
   * Vazio = anthropic se houver ANTHROPIC_API_KEY, senão off.
   */
  TRANSLATION_PROVIDER: z.enum(['', 'anthropic', 'fake', 'off']).default(''),
  ANTHROPIC_API_KEY: z.string().trim().default(''),
  TRANSLATION_MODEL: z.string().trim().min(1).default('claude-sonnet-5-5'),
  TRANSLATION_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  /** Tradução aos poucos, em segundo plano, do que ainda falta (Torá e perguntas da IA). */
  TRANSLATION_WARMER: bool.default(true),
  /**
   * Pasta com a versão web do app (`pnpm --filter @trivia/mobile export:web`). Com ela,
   * a API serve o jogo no mesmo endereço (a API fica em /api): abre no navegador do
   * celular sem instalar nada e sem CORS. Vazio = só a API. Relativa à raiz do repositório.
   */
  WEB_DIR: z.string().trim().default(''),
  /**
   * Anúncios (Fase 9): admob (reais, prêmio só com a confirmação do Google), trust-client
   * (anúncios de teste do AdMob, confiando no app; só fora de produção), demo (anúncio
   * desenhado pelo jogo; só fora de produção) ou off. Vazio = demo em desenvolvimento, off em produção.
   */
  ADS_MODE: z.enum(['', 'admob', 'trust-client', 'demo', 'off']).default(''),
  /** Chaves públicas do AdMob para conferir a confirmação dos anúncios com prêmio (SSV). */
  ADMOB_SSV_KEYS_URL: z.url().default('https://www.gstatic.com/admob/reward/verifier-keys.json'),
  /**
   * Compras: live (App Store e Google Play), demo (compra simulada; só fora de produção) ou
   * off. Vazio = demo em desenvolvimento; em produção, live se alguma loja estiver configurada.
   */
  STORE_MODE: z.enum(['', 'live', 'demo', 'off']).default(''),
  /** App Store: bundle id, id numérico do app e a pasta com os certificados raiz da Apple (.cer). */
  APPLE_BUNDLE_ID: z.string().trim().default(''),
  APPLE_APP_ID: z.string().trim().regex(/^\d*$/, 'APPLE_APP_ID é o número do app na App Store Connect').default(''),
  APPLE_ROOT_CERTS_DIR: z.string().trim().default(''),
  /** Google Play: nome do pacote e o arquivo JSON da conta de serviço com acesso à API do Play. */
  GOOGLE_PLAY_PACKAGE_NAME: z.string().trim().default(''),
  GOOGLE_PLAY_SERVICE_ACCOUNT_FILE: z.string().trim().default(''),
  /**
   * Login social (Fase 10). Google: ids de cliente OAuth (web, iOS, Android), separados
   * por vírgula. Apple: bundle id do app e, se houver, o Services ID da web (vazio = o
   * APPLE_BUNDLE_ID). Facebook: id e segredo do app. Sem eles, o botão não aparece.
   */
  GOOGLE_CLIENT_IDS: z.string().default('').transform(list),
  APPLE_SIGNIN_CLIENT_IDS: z.string().default('').transform(list),
  FACEBOOK_APP_ID: z.string().trim().regex(/^\d*$/, 'FACEBOOK_APP_ID é o número do app no Meta for Developers').default(''),
  FACEBOOK_APP_SECRET: z.string().trim().default(''),
});

/** Ambientes em que a API aceita configurações de desenvolvimento (http no CORS, por exemplo). */
const DEV_ENVS = new Set(['development', 'test']);

export interface AppConfig {
  /** true fora de development/test: regras de produção (CORS só https, avisos). */
  production: boolean;
  port: number;
  /** Vazio = todas as interfaces. */
  host: string;
  databaseUrl: string;
  jwt: { accessSecret: string; refreshSecret: string; accessTtlSeconds: number; refreshTtlSeconds: number };
  corsOrigins: string[];
  rankingTimeZone: string;
  trustProxy: boolean | number | string;
  rateLimitEnabled: boolean;
  maintenanceEnabled: boolean;
  botsEnabled: boolean;
  translation: {
    provider: 'anthropic' | 'fake' | 'off';
    apiKey: string;
    model: string;
    concurrency: number;
    warmer: boolean;
  };
  /** Pasta absoluta da versão web servida pela API, ou null. */
  webDir: string | null;
  economy: EconomyConfig;
  social: SocialConfig;
}

export interface SocialConfig {
  google: { clientIds: string[] } | null;
  apple: { clientIds: string[] } | null;
  facebook: { appId: string; appSecret: string } | null;
}

export interface EconomyConfig {
  adsMode: 'admob' | 'trust-client' | 'demo' | 'off';
  admobKeysUrl: string;
  storeMode: 'live' | 'demo' | 'off';
  /** Chave do HMAC que fixa os prêmios (derivada do segredo dos tokens: nada novo para guardar). */
  rewardsKey: Buffer;
  apple: { bundleId: string; appAppleId: number | null; rootCertsDir: string } | null;
  google: { packageName: string; serviceAccountFile: string } | null;
}

/** Valores de exemplo do .env.example: são públicos, então nunca são aceitos. */
export function isPlaceholderSecret(value: string): boolean {
  return /^troque-por/i.test(value.trim());
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (env === process.env) loadEnv({ path: path.join(REPO_ROOT, '.env'), quiet: true });
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuração inválida no .env:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const production = !DEV_ENVS.has(e.NODE_ENV);
  const problems: string[] = [];

  const placeholders = (['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const).filter((k) => isPlaceholderSecret(e[k]));
  if (placeholders.length) {
    problems.push(
      `${placeholders.join(' e ')} ainda com o valor de exemplo, que é público. Rode "pnpm secrets:init" para gerar segredos aleatórios no .env.`,
    );
  }
  if (e.JWT_ACCESS_SECRET === e.JWT_REFRESH_SECRET) {
    problems.push('JWT_ACCESS_SECRET e JWT_REFRESH_SECRET precisam ser diferentes.');
  }
  if (production) {
    const insecure = e.CORS_ORIGINS.filter((o) => o === '*' || !o.startsWith('https://'));
    if (insecure.length) {
      problems.push(`Em produção, CORS_ORIGINS só aceita origens https:// (recebido: ${insecure.join(', ')}).`);
    }
    if (!e.RATE_LIMIT_ENABLED) problems.push('RATE_LIMIT_ENABLED=false só é permitido em testes.');
    if (e.TRANSLATION_PROVIDER === 'fake') problems.push('TRANSLATION_PROVIDER=fake (tradução de teste) só é permitido em desenvolvimento.');
  }
  const apple = e.APPLE_BUNDLE_ID
    ? { bundleId: e.APPLE_BUNDLE_ID, appAppleId: e.APPLE_APP_ID ? Number(e.APPLE_APP_ID) : null, rootCertsDir: path.resolve(REPO_ROOT, e.APPLE_ROOT_CERTS_DIR || 'certs/apple') }
    : null;
  const google = e.GOOGLE_PLAY_PACKAGE_NAME
    ? { packageName: e.GOOGLE_PLAY_PACKAGE_NAME, serviceAccountFile: path.resolve(REPO_ROOT, e.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE) }
    : null;
  const adsMode = e.ADS_MODE || (production ? 'off' : 'demo');
  const storeMode = e.STORE_MODE || (production ? (apple || google ? 'live' : 'off') : 'demo');
  if (production && (adsMode === 'demo' || adsMode === 'trust-client')) {
    problems.push(`ADS_MODE=${adsMode} entrega prêmios sem a confirmação do Google: só é permitido em desenvolvimento.`);
  }
  if (production && storeMode === 'demo') problems.push('STORE_MODE=demo (compra simulada) só é permitido em desenvolvimento.');
  if (storeMode === 'live' && !apple && !google) {
    problems.push('STORE_MODE=live precisa de ao menos uma loja: APPLE_BUNDLE_ID ou GOOGLE_PLAY_PACKAGE_NAME.');
  }
  if (production && apple && apple.appAppleId === null) problems.push('Em produção, a App Store pede APPLE_APP_ID para conferir as compras.');
  if (google && !e.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE) problems.push('GOOGLE_PLAY_PACKAGE_NAME precisa de GOOGLE_PLAY_SERVICE_ACCOUNT_FILE.');
  if (!!e.FACEBOOK_APP_ID !== !!e.FACEBOOK_APP_SECRET) problems.push('O login com Facebook precisa de FACEBOOK_APP_ID e FACEBOOK_APP_SECRET juntos.');
  if (e.TRANSLATION_PROVIDER === 'anthropic' && !e.ANTHROPIC_API_KEY) {
    problems.push('TRANSLATION_PROVIDER=anthropic precisa de ANTHROPIC_API_KEY.');
  }
  if (problems.length) {
    const hint = production
      ? `\n  (NODE_ENV="${e.NODE_ENV}" ativa as regras de produção. No seu computador, use NODE_ENV="development" no .env.)`
      : '';
    throw new Error(`Configuração insegura no .env:\n${problems.map((p) => `  - ${p}`).join('\n')}${hint}`);
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: e.RANKING_TIMEZONE });
  } catch {
    throw new Error(`RANKING_TIMEZONE inválido: ${e.RANKING_TIMEZONE}`);
  }
  return {
    production,
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    jwt: {
      accessSecret: e.JWT_ACCESS_SECRET,
      refreshSecret: e.JWT_REFRESH_SECRET,
      accessTtlSeconds: e.JWT_ACCESS_TTL,
      refreshTtlSeconds: e.JWT_REFRESH_TTL,
    },
    corsOrigins: e.CORS_ORIGINS,
    rankingTimeZone: e.RANKING_TIMEZONE,
    trustProxy: e.TRUST_PROXY,
    rateLimitEnabled: e.RATE_LIMIT_ENABLED,
    maintenanceEnabled: e.MAINTENANCE_ENABLED,
    botsEnabled: e.BOTS_ENABLED,
    translation: {
      provider: e.TRANSLATION_PROVIDER || (e.ANTHROPIC_API_KEY ? 'anthropic' : 'off'),
      apiKey: e.ANTHROPIC_API_KEY,
      model: e.TRANSLATION_MODEL,
      concurrency: e.TRANSLATION_CONCURRENCY,
      warmer: e.TRANSLATION_WARMER,
    },
    webDir: e.WEB_DIR ? path.resolve(REPO_ROOT, e.WEB_DIR) : null,
    economy: {
      adsMode,
      admobKeysUrl: e.ADMOB_SSV_KEYS_URL,
      storeMode,
      rewardsKey: createHmac('sha256', e.JWT_ACCESS_SECRET).update('trivia-torah/rewards/v1').digest(),
      apple,
      google,
    },
    social: {
      google: e.GOOGLE_CLIENT_IDS.length ? { clientIds: e.GOOGLE_CLIENT_IDS } : null,
      apple: (() => {
        const ids = e.APPLE_SIGNIN_CLIENT_IDS.length ? e.APPLE_SIGNIN_CLIENT_IDS : e.APPLE_BUNDLE_ID ? [e.APPLE_BUNDLE_ID] : [];
        return ids.length ? { clientIds: ids } : null;
      })(),
      facebook: e.FACEBOOK_APP_ID && e.FACEBOOK_APP_SECRET ? { appId: e.FACEBOOK_APP_ID, appSecret: e.FACEBOOK_APP_SECRET } : null,
    },
  };
}
