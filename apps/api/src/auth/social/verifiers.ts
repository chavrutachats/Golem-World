/**
 * Conferência dos logins sociais. O app nunca diz "sou fulano do Google": ele manda o
 * que o provedor entregou, e o servidor confere com o próprio provedor.
 *
 * - Google e Apple: ID token (JWT) com assinatura conferida contra as chaves públicas
 *   do provedor (JWKS, em cache), emissor, público (os ids deste app), validade e, quando
 *   houver, o nonce (o token traz o SHA-256 do nonce que só o app conhece).
 * - Facebook: access token conferido na Graph API com o token do app (debug_token):
 *   precisa ter sido emitido para ESTE app, senão um token de outro app qualquer
 *   serviria para entrar aqui.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { SocialProvider } from '@trivia/shared';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { Errors } from '../../common/http.js';

export interface SocialProfile {
  /** Id estável do usuário no provedor. */
  subject: string;
  /** E-mail confirmado pelo provedor (só quando ele garante que é do usuário). */
  email: string | null;
  name: string | null;
}

export interface SocialVerifier {
  readonly provider: SocialProvider;
  verify(input: { token: string; nonce?: string | undefined }): Promise<SocialProfile>;
}

// 422, e não 401: o app trata 401 como "sessão vencida" (e quem está ligando um login já tem sessão).
const invalid = () => Errors.unprocessable('SOCIAL_INVALID', 'Não foi possível confirmar o login com este serviço. Tente de novo.');
const unavailable = () => Errors.unavailable('SOCIAL_UNAVAILABLE', 'O serviço de login não respondeu agora. Tente de novo em instantes.');

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** E-mail só conta se o provedor diz que está confirmado ("true" vem como texto na Apple). */
function verifiedEmail(payload: JWTPayload): string | null {
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
  const ok = payload.email_verified === true || payload.email_verified === 'true';
  return email && ok ? email : null;
}

/** Erros de assinatura e de conteúdo viram 401; falha de rede ao buscar as chaves, 503. */
async function verifyJwt(token: string, keys: JWTVerifyGetKey, opts: { issuer: string[]; audience: string[] }): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, keys, { issuer: opts.issuer, audience: opts.audience, algorithms: ['RS256', 'ES256'], clockTolerance: 60 });
    return payload;
  } catch (e) {
    if (e instanceof joseErrors.JOSEError && !(e instanceof joseErrors.JWKSTimeout)) throw invalid();
    throw unavailable();
  }
}

function checkNonce(payload: JWTPayload, nonce: string | undefined, required: boolean): void {
  const claim = typeof payload.nonce === 'string' ? payload.nonce : null;
  if (!claim && !required) return;
  if (!claim || !nonce || !sameText(claim, sha256Hex(nonce))) throw invalid();
}

// ---------------------------------------------------------------------------

export class GoogleVerifier implements SocialVerifier {
  readonly provider = 'google' as const;

  constructor(
    /** Ids de cliente OAuth deste app (web, iOS, Android): o token precisa ter sido feito para um deles. */
    private readonly clientIds: readonly string[],
    private readonly keys: JWTVerifyGetKey = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),
  ) {}

  async verify({ token, nonce }: { token: string; nonce?: string | undefined }): Promise<SocialProfile> {
    const payload = await verifyJwt(token, this.keys, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: [...this.clientIds] });
    // O SDK nativo do Google não manda nonce; o login da web manda. Quando vier, precisa bater.
    checkNonce(payload, nonce, false);
    if (!payload.sub) throw invalid();
    return { subject: payload.sub, email: verifiedEmail(payload), name: typeof payload.name === 'string' ? payload.name : null };
  }
}

export class AppleVerifier implements SocialVerifier {
  readonly provider = 'apple' as const;

  constructor(
    /** Bundle id do app (login no iPhone) e, se houver, o Services ID (login na web). */
    private readonly clientIds: readonly string[],
    private readonly keys: JWTVerifyGetKey = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
  ) {}

  async verify({ token, nonce }: { token: string; nonce?: string | undefined }): Promise<SocialProfile> {
    const payload = await verifyJwt(token, this.keys, { issuer: ['https://appleid.apple.com'], audience: [...this.clientIds] });
    // Na Apple o nonce é obrigatório: o app sempre manda.
    checkNonce(payload, nonce, true);
    if (!payload.sub) throw invalid();
    // A Apple manda o nome só ao app, na primeira vez (não vem no token).
    return { subject: payload.sub, email: verifiedEmail(payload), name: null };
  }
}

/** O mínimo de fetch que o verificador do Facebook usa (trocável nos testes). */
export type FetchJson = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const GRAPH = 'https://graph.facebook.com/v21.0';

export class FacebookVerifier implements SocialVerifier {
  readonly provider = 'facebook' as const;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly fetchJson: FetchJson = (url) => fetch(url),
  ) {}

  private async get<T>(url: string): Promise<T> {
    let res;
    try {
      res = await this.fetchJson(url);
    } catch {
      throw unavailable();
    }
    if (res.status >= 500) throw unavailable();
    if (!res.ok) throw invalid();
    return (await res.json()) as T;
  }

  async verify({ token }: { token: string }): Promise<SocialProfile> {
    const appToken = `${this.appId}|${this.appSecret}`;
    const debug = await this.get<{ data?: { is_valid?: boolean; app_id?: string; user_id?: string } }>(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`,
    );
    const d = debug.data;
    if (!d?.is_valid || d.app_id !== this.appId || !d.user_id) throw invalid();
    const me = await this.get<{ id?: string; name?: string; email?: string }>(`${GRAPH}/me?fields=id,name,email&access_token=${encodeURIComponent(token)}`);
    if (me.id !== d.user_id) throw invalid();
    // O Facebook só devolve e-mail confirmado.
    return { subject: d.user_id, email: me.email?.trim().toLowerCase() ?? null, name: me.name ?? null };
  }
}
