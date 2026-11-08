/**
 * Login pelo navegador (OAuth), para o Google na web e o Facebook em todo lugar. O
 * provedor só aceita voltar para endereços cadastrados: https, localhost ou, no app
 * instalado, o esquema próprio (fb<id>://). Na rede de casa por http (pnpm lan) o
 * Google e o Facebook recusam, então os botões não aparecem ali.
 */
import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';

/** O navegador aceita este endereço como retorno do login? */
export function secureOrigin(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
  const { protocol, hostname } = window.location;
  return protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1';
}

export async function oauth(opts: {
  authorizationEndpoint: string;
  clientId: string;
  scopes: string[];
  responseType: 'id_token' | 'token';
  redirectUri: string;
  extraParams?: Record<string, string>;
}): Promise<Record<string, string> | null> {
  const request = new AuthSession.AuthRequest({
    clientId: opts.clientId,
    redirectUri: opts.redirectUri,
    scopes: opts.scopes,
    responseType: opts.responseType === 'id_token' ? AuthSession.ResponseType.IdToken : AuthSession.ResponseType.Token,
    usePKCE: false,
    ...(opts.extraParams ? { extraParams: opts.extraParams } : {}),
  });
  const result = await request.promptAsync({ authorizationEndpoint: opts.authorizationEndpoint });
  if (result.type !== 'success') return null;
  return result.params;
}
