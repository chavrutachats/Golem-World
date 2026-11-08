/**
 * Telas da economia que aparecem por cima de tudo, montadas uma vez no layout:
 *
 * - anúncio de demonstração (web, Expo Go): contagem regressiva e, no com prêmio,
 *   "Pegar o prêmio" só no fim (fechar antes não dá nada, como num anúncio real);
 * - aviso do presente antes do anúncio de pausa: mostra o prêmio, começa sozinho em
 *   5 segundos e tem "Não, obrigado" (regra do AdMob para anúncio de pausa com prêmio);
 * - confirmação da compra de demonstração (nada é cobrado);
 * - avisos curtos no rodapé.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameButton, GamePanel } from '@/components/game/GameUI';
import { GameText } from '@/components/game/GameText';
import { GolemFace } from '@/components/game/GolemFace';
import { ShekelIcon } from '@/components/game/icons';
import { T } from '@/components/ui/Text';
import { t } from '@/lib/i18n';
import { productName, restorePurchases, useMonetization } from '@/lib/monetization';
import { useMonetizationHost, type HostRequest } from '@/lib/monetization/host';
import { g } from '@/theme/game';
import { PrizeBadge } from './PrizeBadge';

const DEMO_AD_SECONDS = 5;
const GIFT_COUNTDOWN = 5;

function useCountdown(seconds: number, active: boolean): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (!active) return;
    setLeft(seconds);
    const started = Date.now();
    const id = setInterval(() => setLeft(Math.max(0, seconds - Math.floor((Date.now() - started) / 1000))), 250);
    return () => clearInterval(id);
  }, [seconds, active]);
  return left;
}

function DemoAd({ request }: { request: Extract<HostRequest, { kind: 'demoAd' }> }) {
  const left = useCountdown(DEMO_AD_SECONDS, true);
  const done = left === 0;
  const close = () => request.resolve(request.rewarded && done ? 'earned' : 'dismissed');
  return (
    <View style={styles.adStage} testID="demo-ad">
      <View style={styles.adTop}>
        <View style={styles.adTag}>
          <GameText size="xs" color={g.ink}>
            {t('Anúncio de demonstração')}
          </GameText>
        </View>
        {request.rewarded || done ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('Fechar')} onPress={close} hitSlop={12} style={styles.adClose} testID="demo-ad-close">
            <Ionicons name="close" size={22} color={g.white} />
          </Pressable>
        ) : (
          <GameText size="sm" color={g.mist}>
            {left}
          </GameText>
        )}
      </View>
      <View style={styles.adBody}>
        <GolemFace size={120} />
        <GameText size="xl" align="center" shadow>
          {t('Aqui entra um anúncio')}
        </GameText>
        <T color={g.mist} align="center">
          {t('No app publicado, o anúncio vem do Google. Nesta versão de teste, o jogo só mostra esta tela.')}
        </T>
      </View>
      {request.rewarded ? (
        <GameButton
          label={done ? t('Pegar o prêmio') : t('O prêmio libera em {n} s', { n: left })}
          tone={done ? 'green' : 'grey'}
          disabled={!done}
          onPress={close}
          testID="demo-ad-reward"
        />
      ) : null}
    </View>
  );
}

function GiftIntro({ request }: { request: Extract<HostRequest, { kind: 'gift' }> }) {
  const left = useCountdown(GIFT_COUNTDOWN, true);
  useEffect(() => {
    if (left === 0) request.resolve(true);
  }, [left, request]);
  return (
    <View style={styles.center} testID="gift-intro">
      <GamePanel style={styles.card}>
        <GameText size="lg" align="center" accessibilityRole="header">
          {t('Um presente antes da pausa')}
        </GameText>
        <View style={styles.prize}>
          <PrizeBadge prize={request.ticket.prize} size="lg" />
        </View>
        <T color={g.mist} align="center">
          {t('Assista a um anúncio curto e o presente é seu. O anúncio começa em {n} s.', { n: left })}
        </T>
        <GameButton label={t('Assistir agora')} tone="green" onPress={() => request.resolve(true)} testID="gift-accept" />
        <GameButton label={t('Não, obrigado')} tone="ghost" size="sm" onPress={() => request.resolve(false)} testID="gift-decline" />
      </GamePanel>
    </View>
  );
}

function DemoPurchase({ request }: { request: Extract<HostRequest, { kind: 'demoPurchase' }> }) {
  return (
    <View style={styles.center} testID="demo-purchase">
      <GamePanel style={styles.card}>
        <View style={styles.prize}>
          <ShekelIcon size={44} />
        </View>
        <GameText size="lg" align="center" accessibilityRole="header">
          {productName(request.productId)}
        </GameText>
        <T color={g.mist} align="center">
          {t('Compra de demonstração: nada é cobrado. No app publicado, quem cobra é a App Store ou o Google Play.')}
        </T>
        <GameButton label={t('Confirmar compra')} tone="green" onPress={() => request.resolve(true)} testID="demo-purchase-confirm" />
        <GameButton label={t('Cancelar')} tone="ghost" size="sm" onPress={() => request.resolve(false)} />
      </GamePanel>
    </View>
  );
}

function Notice() {
  const notice = useMonetizationHost((s) => s.notice);
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<typeof notice>(null);
  useEffect(() => {
    if (!notice) return;
    setShown(notice);
    const id = setTimeout(() => setShown(null), 2600);
    return () => clearTimeout(id);
  }, [notice]);
  if (!shown) return null;
  return (
    <Animated.View key={shown.key} entering={FadeInDown.duration(220)} exiting={FadeOut.duration(200)} style={[styles.notice, { bottom: insets.bottom + 84 }]} pointerEvents="none">
      <GameText size="sm" align="center" accessibilityLiveRegion="polite" testID="economy-notice">
        {shown.text}
      </GameText>
    </Animated.View>
  );
}

/** Voltar no Android ou tocar fora: o anúncio fecha sem prêmio; as outras telas respondem "não". */
function cancel(request: HostRequest): void {
  if (request.kind === 'demoAd') request.resolve('dismissed');
  else request.resolve(false);
}

export function MonetizationHost() {
  const request = useMonetizationHost((s) => s.request);
  // Mantém a economia carregada (o botão "Sem anúncios" e as pausas dependem dela).
  const { store } = useMonetization();
  // Compra interrompida (o app fechou entre a loja e o servidor): entrega ao abrir, sem pedir senha.
  const storeKind = store?.kind;
  useEffect(() => {
    if (storeKind && storeKind !== 'demo') void restorePurchases(false).catch(() => undefined);
  }, [storeKind]);
  return (
    <>
      <Modal visible={!!request} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {
          if (request) cancel(request);
        }}>
        <View style={[styles.backdrop, request?.kind === 'demoAd' && styles.backdropAd]}>
          {request?.kind === 'demoAd' ? <DemoAd request={request} /> : null}
          {request?.kind === 'gift' ? <GiftIntro request={request} /> : null}
          {request?.kind === 'demoPurchase' ? <DemoPurchase request={request} /> : null}
        </View>
      </Modal>
      <Notice />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,10,30,0.8)' },
  backdropAd: { backgroundColor: '#0B1240' },
  center: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { gap: 14, padding: 20, maxWidth: 420, width: '100%', alignSelf: 'center' },
  prize: { alignItems: 'center', paddingVertical: 6 },
  adStage: { flex: 1, padding: 20, paddingTop: 48, paddingBottom: 36, gap: 16, maxWidth: 520, width: '100%', alignSelf: 'center' },
  adTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  adTag: { backgroundColor: g.gold, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  adClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  adBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 8 },
  notice: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: 360,
    backgroundColor: 'rgba(19,28,85,0.94)',
    borderColor: g.gold,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
