/** Facebook: OAuth no navegador (web em https; no app, volta pelo esquema fb<id>://). */
import * as AuthSession from 'expo-auth-session';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { oauth, secureOrigin } from './oauth';
import type { SocialAdapter } from './types';

const appId = () => process.env.EXPO_PUBLIC_FACEBOOK_APP_ID?.trim() ?? '';

export const facebook: SocialAdapter = {
  provider: 'facebook',
  async available() {
    // No Expo Go o esquema fb<id>:// não existe (ele só entra no app instalado).
    if (Platform.OS !== 'web' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
    return !!appId() && secureOrigin();
  },
  async signIn() {
    const params = await oauth({
      authorizationEndpoint: 'https://www.facebook.com/v21.0/dialog/oauth',
      clientId: appId(),
      scopes: ['public_profile', 'email'],
      responseType: 'token',
      redirectUri: AuthSession.makeRedirectUri({ native: `fb${appId()}://authorize` }),
    });
    return params?.access_token ? { provider: 'facebook', token: params.access_token } : null;
  },
};
