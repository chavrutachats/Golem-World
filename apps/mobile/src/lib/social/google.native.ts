/**
 * Google no app instalado: o SDK nativo (@react-native-google-signin), como a Expo
 * recomenda. O ID token sai para o "web client id" (é ele que o servidor aceita).
 * No Expo Go o módulo nativo não existe: o botão não aparece.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { SocialAdapter } from './types';

type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');

let mod: GoogleSignInModule | null | undefined;
function load(): GoogleSignInModule | null {
  if (mod !== undefined) return mod;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!webClientId || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return (mod = null);
  try {
    mod = require('@react-native-google-signin/google-signin') as GoogleSignInModule;
    mod.GoogleSignin.configure({
      webClientId,
      ...(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ? { iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID.trim() } : {}),
      scopes: ['email', 'profile'],
    });
  } catch {
    mod = null;
  }
  return mod;
}

export const google: SocialAdapter = {
  provider: 'google',
  async available() {
    return load() !== null;
  },
  async signIn() {
    const m = load();
    if (!m) return null;
    try {
      await m.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await m.GoogleSignin.signIn();
      if (!m.isSuccessResponse(res) || !res.data.idToken) return null;
      return { provider: 'google', token: res.data.idToken, ...(res.data.user.givenName ? { displayName: res.data.user.givenName } : {}) };
    } catch (e) {
      if (m.isErrorWithCode(e) && (e.code === m.statusCodes.SIGN_IN_CANCELLED || e.code === m.statusCodes.IN_PROGRESS)) return null;
      throw e;
    }
  },
};
