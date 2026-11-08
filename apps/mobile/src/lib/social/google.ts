/** Google na web: OAuth com ID token e nonce (só em https ou localhost). */
import * as AuthSession from 'expo-auth-session';
import { makeNonce } from './nonce';
import { oauth, secureOrigin } from './oauth';
import type { SocialAdapter } from './types';

const clientId = () => process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? '';

export const google: SocialAdapter = {
  provider: 'google',
  async available() {
    return !!clientId() && secureOrigin();
  },
  async signIn() {
    const nonce = await makeNonce();
    const params = await oauth({
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      clientId: clientId(),
      scopes: ['openid', 'email', 'profile'],
      responseType: 'id_token',
      redirectUri: AuthSession.makeRedirectUri(),
      extraParams: { nonce: nonce.hashed, prompt: 'select_account' },
    });
    return params?.id_token ? { provider: 'google', token: params.id_token, nonce: nonce.raw } : null;
  },
};
