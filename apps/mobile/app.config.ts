/**
 * Configuração dinâmica do Expo: parte do app.json e acrescenta os plugins da Fase 9.
 *
 * - AdMob (react-native-google-mobile-ads): os ids do app vêm de ADMOB_ANDROID_APP_ID e
 *   ADMOB_IOS_APP_ID na hora do build; sem eles, os ids de teste do Google (só anúncios
 *   de teste, nunca cobram nem pagam). Os blocos de anúncio ficam em EXPO_PUBLIC_ADMOB_*.
 * - Compras (expo-iap): App Store e Google Play.
 *
 * Os dois exigem um build de desenvolvimento ou de loja (EAS); no Expo Go e na web o
 * jogo usa o anúncio e a compra de demonstração.
 *
 * Fase 10 (login social):
 * - Google: SDK nativo; no iPhone precisa do esquema de URL do id de cliente iOS
 *   (EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ao contrário). Sem ele, o plugin fica de fora e o
 *   botão do Google não aparece no iPhone.
 * - Apple: 'Sign in with Apple' no iPhone (entitlement ligado pelo plugin).
 * - Facebook: volta do login pelo esquema fb<id>:// (EXPO_PUBLIC_FACEBOOK_APP_ID).
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Ids de app de teste publicados pelo Google para desenvolvimento. */
const TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

const env = (name: string): string | undefined => process.env[name]?.trim() || undefined;

/** "123-abc.apps.googleusercontent.com" → "com.googleusercontent.apps.123-abc" (o retorno do login no iPhone). */
export function googleIosUrlScheme(iosClientId: string): string {
  return iosClientId.split('.').reverse().join('.');
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  const googleIos = env('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID');
  const facebookAppId = env('EXPO_PUBLIC_FACEBOOK_APP_ID');
  const schemes = [base.scheme ?? [], facebookAppId ? `fb${facebookAppId}` : []].flat();
  return {
    ...base,
    scheme: schemes.length === 1 ? schemes[0]! : schemes,
    ios: { ...base.ios, usesAppleSignIn: true },
    plugins: [
      ...(base.plugins ?? []),
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: env('ADMOB_ANDROID_APP_ID') ?? TEST_ANDROID_APP_ID,
          iosAppId: env('ADMOB_IOS_APP_ID') ?? TEST_IOS_APP_ID,
          // Só anúncios não personalizados: o app não pede rastreamento (sem a tela do ATT).
          delayAppMeasurementInit: true,
        },
      ],
      'expo-iap',
      'expo-apple-authentication',
      ...(googleIos ? [['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme(googleIos) }] satisfies [string, unknown]] : []),
    ],
  };
};
