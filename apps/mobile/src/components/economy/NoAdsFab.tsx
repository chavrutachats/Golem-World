/**
 * Botão flutuante "Sem anúncios", visível em todas as telas enquanto o jogador não
 * comprou. Ele tira só os anúncios obrigatórios das pausas; os anúncios com prêmio
 * continuam disponíveis para quem quiser. Nas telas de pergunta ele vira um círculo
 * pequeno, para não cobrir as alternativas.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { NO_ADS_PRODUCT_ID } from '@trivia/shared';
import { usePathname } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameButton, GamePanel } from '@/components/game/GameUI';
import { GameText } from '@/components/game/GameText';
import { T } from '@/components/ui/Text';
import { ApiError } from '@/lib/api-core';
import { t } from '@/lib/i18n';
import { buyProduct, notify, restorePurchases, useMonetization, useStoreProducts } from '@/lib/monetization';
import { useSession } from '@/lib/session';
import { g } from '@/theme/game';

/**
 * Onde o botão flutuante mostra o texto inteiro: telas com espaço livre embaixo. Nas
 * outras ele vira um círculo; nas telas de pergunta ele sai do rodapé e vai para o
 * cabeçalho (<NoAdsButton />), para não cobrir alternativa nenhuma.
 */
const FULL = [/^\/$/, /^\/journey$/];
const IN_HEADER = [/^\/journey\/run\//, /^\/game\/[^/]+\/question/, /^\/puzzle\/\d+/];

/** Quando o botão aparece: conta aberta, anúncios ligados e "Sem anúncios" ainda não comprado. */
function useShowNoAds(): boolean {
  const signedIn = useSession((s) => s.status === 'signedIn');
  const { economy } = useMonetization();
  return signedIn && !!economy && !economy.adFree && economy.ads.mode !== 'off';
}

function NoAdsSheet({ onClose }: { onClose: () => void }) {
  const { store } = useMonetization();
  const products = useStoreProducts([NO_ADS_PRODUCT_ID]);
  const price = products.data?.[0]?.price ?? null;
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  const run = async (kind: 'buy' | 'restore') => {
    setBusy(kind);
    try {
      if (kind === 'buy') {
        if (await buyProduct(NO_ADS_PRODUCT_ID)) onClose();
      } else {
        const n = await restorePurchases(true);
        notify(n > 0 ? t('Compras restauradas.') : t('Nenhuma compra para restaurar nesta conta da loja.'));
      }
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t('A compra não foi concluída. Nada foi cobrado.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(150)} style={styles.scrim}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Fechar')} style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View entering={SlideInDown.springify().damping(18)} style={styles.sheet} pointerEvents="box-none" testID="no-ads-sheet">
        <GamePanel style={styles.panel}>
          <View style={styles.badge}>
            <Ionicons name="megaphone" size={34} color={g.gold} />
            <View style={styles.slash} />
          </View>
          <GameText size="xl" align="center" accessibilityRole="header">
            {t('Sem anúncios')}
          </GameText>
          <T color={g.white} align="center">
            {t('Tira para sempre os anúncios obrigatórios das pausas, em qualquer aparelho com a sua conta.')}
          </T>
          <T variant="small" color={g.mist} align="center">
            {t('Os anúncios com prêmio continuam aqui: assista quando quiser ganhar uma vida, uma ajuda ou o prêmio da rodada.')}
          </T>
          {store ? (
            <>
              <GameButton
                label={price ? t('Comprar por {price}', { price }) : t('Comprar')}
                tone="green"
                loading={busy === 'buy'}
                disabled={!!busy}
                onPress={() => void run('buy')}
                testID="no-ads-buy"
              />
              {store.kind !== 'demo' ? (
                <GameButton label={t('Restaurar compras')} tone="ghost" size="sm" loading={busy === 'restore'} disabled={!!busy} onPress={() => void run('restore')} />
              ) : null}
            </>
          ) : (
            <T variant="small" color={g.gold} align="center">
              {t('A compra fica disponível no app instalado pela App Store ou pelo Google Play.')}
            </T>
          )}
          <GameButton label={t('Agora não')} tone="ghost" size="sm" onPress={onClose} />
        </GamePanel>
      </Animated.View>
    </Modal>
  );
}

/** Versão do cabeçalho (telas de pergunta): o mesmo botão, em linha. */
export function NoAdsButton({ tint = g.white }: { tint?: string }) {
  const show = useShowNoAds();
  const [open, setOpen] = useState(false);
  if (!show) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Sem anúncios')}
        accessibilityHint={t('Mostra como tirar os anúncios obrigatórios')}
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ pressed }) => [styles.inline, { borderColor: tint }, pressed && styles.pressedInline]}
        testID="no-ads-inline"
      >
        <View>
          <Ionicons name="megaphone" size={15} color={tint} />
          <View style={[styles.slashSmall, styles.slashInline]} />
        </View>
      </Pressable>
      {open ? <NoAdsSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function NoAdsFab() {
  const show = useShowNoAds();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  if (!show || IN_HEADER.some((re) => re.test(pathname))) return null;
  const compact = !FULL.some((re) => re.test(pathname));
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Sem anúncios')}
        accessibilityHint={t('Mostra como tirar os anúncios obrigatórios')}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.fab, compact ? styles.fabCompact : styles.fabFull, { bottom: insets.bottom + 12 }, pressed && styles.pressed]}
        testID="no-ads-fab"
      >
        <View>
          <Ionicons name="megaphone" size={compact ? 16 : 18} color={g.ink} />
          <View style={styles.slashSmall} />
        </View>
        {compact ? null : (
          <GameText size="sm" weight="bold" color={g.ink}>
            {t('Sem anúncios')}
          </GameText>
        )}
      </Pressable>
      {open ? <NoAdsSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    start: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: g.gold,
    borderBottomWidth: 3,
    borderColor: g.goldDeep,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  fabFull: { borderRadius: 20, paddingHorizontal: 12, height: 38 },
  fabCompact: { borderRadius: 16, width: 32, height: 32, justifyContent: 'center', opacity: 0.85 },
  pressed: { transform: [{ translateY: 2 }], borderBottomWidth: 1 },
  slashSmall: { position: 'absolute', width: 22, height: 2.5, backgroundColor: g.redDeep, top: 7, left: -2, transform: [{ rotate: '-35deg' }] },
  slashInline: { width: 19, top: 6, backgroundColor: g.red },
  inline: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', opacity: 0.9 },
  pressedInline: { opacity: 0.6 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,10,30,0.6)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 28, alignItems: 'center' },
  panel: { gap: 12, padding: 20, width: '100%', maxWidth: 480 },
  badge: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  slash: { position: 'absolute', width: 52, height: 4, borderRadius: 2, backgroundColor: g.red, transform: [{ rotate: '-35deg' }] },
});
