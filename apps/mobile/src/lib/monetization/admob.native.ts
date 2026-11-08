/**
 * Anúncios de verdade (AdMob), só no app instalado. No Expo Go o módulo nativo não
 * existe: aí este adaptador não é criado e o jogo usa o de demonstração.
 *
 * Todo pedido é não personalizado e com classificação G (livre): o jogo é estudo de
 * Torá e pode ser usado por crianças (ECA Digital, Lei 15.211/2025). Quem publicar o
 * app voltado a crianças marca também EXPO_PUBLIC_ADS_CHILD_DIRECTED=true.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type { AdOutcome, AdsAdapter } from './types';

const LOAD_TIMEOUT_MS = 15_000;

type Gma = typeof import('react-native-google-mobile-ads');

/** Ids dos blocos de anúncio: do .env do app; sem eles, os de teste do Google. */
function units(m: Gma) {
  const env = (ios: string | undefined, android: string | undefined) => (Platform.OS === 'ios' ? ios : android)?.trim() || undefined;
  return {
    rewarded: env(process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS, process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID) ?? m.TestIds.REWARDED,
    rewardedInterstitial:
      env(process.env.EXPO_PUBLIC_ADMOB_REWARDED_INTERSTITIAL_IOS, process.env.EXPO_PUBLIC_ADMOB_REWARDED_INTERSTITIAL_ANDROID) ?? m.TestIds.REWARDED_INTERSTITIAL,
    interstitial: env(process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS, process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID) ?? m.TestIds.INTERSTITIAL,
  };
}

export function createAdmobAdapter(): AdsAdapter | null {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  let m: Gma;
  try {
    // Só carrega o módulo nativo aqui (no Expo Go ele não existe).
    m = require('react-native-google-mobile-ads') as Gma;
  } catch {
    return null;
  }
  const ids = units(m);
  let ready: Promise<unknown> | null = null;
  const init = () =>
    (ready ??= m
      .default()
      .setRequestConfiguration({
        maxAdContentRating: m.MaxAdContentRating.G,
        tagForChildDirectedTreatment: process.env.EXPO_PUBLIC_ADS_CHILD_DIRECTED === 'true',
      })
      .then(() => m.default().initialize()));
  const request = { requestNonPersonalizedAdsOnly: true };

  /** Carrega, mostra e espera fechar. */
  function present(ad: { load(): void; show(): Promise<void>; addAdEventListener: (type: never, cb: (...args: never[]) => void) => () => void }, onEarned?: () => void): Promise<'closed' | 'failed'> {
    return new Promise((resolve) => {
      const subs: (() => void)[] = [];
      let settled = false;
      const done = (r: 'closed' | 'failed') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        subs.forEach((off) => off());
        resolve(r);
      };
      const timer = setTimeout(() => done('failed'), LOAD_TIMEOUT_MS);
      const on = (type: string, cb: () => void) => subs.push(ad.addAdEventListener(type as never, cb as never));
      on(m.RewardedAdEventType.LOADED, () => {
        clearTimeout(timer);
        ad.show().catch(() => done('failed'));
      });
      on(m.AdEventType.LOADED, () => {
        clearTimeout(timer);
        ad.show().catch(() => done('failed'));
      });
      if (onEarned) on(m.RewardedAdEventType.EARNED_REWARD, onEarned);
      on(m.AdEventType.CLOSED, () => done('closed'));
      on(m.AdEventType.ERROR, () => done('failed'));
      ad.load();
    });
  }

  return {
    kind: 'admob',
    async showRewarded({ userId, customData, interstitial }): Promise<AdOutcome> {
      await init();
      const opts = { ...request, serverSideVerificationOptions: { userId, customData } };
      const ad = interstitial ? m.RewardedInterstitialAd.createForAdRequest(ids.rewardedInterstitial, opts) : m.RewardedAd.createForAdRequest(ids.rewarded, opts);
      let earned = false;
      const end = await present(ad as never, () => {
        earned = true;
      });
      return end === 'failed' ? 'failed' : earned ? 'earned' : 'dismissed';
    },
    async showInterstitial() {
      await init();
      await present(m.InterstitialAd.createForAdRequest(ids.interstitial, request) as never);
    },
  };
}
