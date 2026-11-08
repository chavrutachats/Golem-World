/**
 * Prêmio da rodada (face do Prêmio no sevivon, Fase 12). Quando o sevivon cai no Prêmio,
 * aparece a folha com o prêmio já à mostra; assistir ao anúncio é opcional, e depois o
 * jogador gira de novo. Se fechar sem assistir, o cartão fica embaixo do sevivon até o
 * próximo giro. O prêmio não mexe na partida: vale fora dela (moedas, vidas, ajudas do
 * Golem World).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { RoundPrize } from '@trivia/shared';
import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { GameButton, GamePanel } from '@/components/game/GameUI';
import { GameText } from '@/components/game/GameText';
import { T } from '@/components/ui/Text';
import { t } from '@/lib/i18n';
import { earnReward, type RewardOutcome } from '@/lib/monetization';
import { g } from '@/theme/game';
import { PrizeBadge } from './PrizeBadge';

async function claim(prize: RoundPrize): Promise<RewardOutcome> {
  return earnReward('wheel', prize.ref);
}

export function RoundPrizeCard({ prize, onClaimed }: { prize: RoundPrize; onClaimed: () => void }) {
  const [busy, setBusy] = useState(false);
  if (prize.claimed) {
    return (
      <View style={[styles.card, styles.done]} testID="round-prize-claimed">
        <Ionicons name="checkmark-circle" size={20} color={g.green} />
        <GameText size="sm" color={g.mist}>
          {t('Prêmio da rodada resgatado')}
        </GameText>
      </View>
    );
  }
  const onPress = async () => {
    setBusy(true);
    const outcome = await claim(prize);
    setBusy(false);
    if (outcome === 'claimed') onClaimed();
  };
  return (
    <Animated.View key={prize.ref} entering={FadeIn.duration(300)} style={styles.card} testID="round-prize">
      <View style={styles.flex}>
        <GameText size="xs" color={g.gold}>
          {t('Prêmio do sevivon')}
        </GameText>
        <PrizeBadge prize={prize.prize} size="sm" />
      </View>
      <GameButton label={t('Assistir')} icon="play" tone="blue" size="sm" loading={busy} onPress={() => void onPress()} accessibilityHint={t('Assista a um anúncio e ganhe o prêmio da rodada')} testID="round-prize-claim" />
    </Animated.View>
  );
}

/** A folha que abre quando o sevivon cai no Prêmio. */
export function PrizeFaceSheet({ prize, onClose }: { prize: RoundPrize; onClose: (claimed: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const watch = async () => {
    setBusy(true);
    const outcome = await claim(prize);
    setBusy(false);
    onClose(outcome === 'claimed');
  };
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => onClose(false)}>
      <View style={styles.backdrop}>
        <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.sheetWrap}>
          <GamePanel style={styles.sheet} testID="prize-face">
            <GameText size="lg" align="center" accessibilityRole="header">
              {t('O sevivon caiu no Prêmio!')}
            </GameText>
            <View style={styles.prize}>
              <PrizeBadge prize={prize.prize} size="lg" />
            </View>
            <T color={g.mist} align="center">
              {t('Assista a um anúncio curto e o prêmio é seu. Ele vale fora da partida; depois, é só girar de novo.')}
            </T>
            <GameButton label={t('Assistir e ganhar')} icon="play" tone="green" loading={busy} onPress={() => void watch()} testID="prize-face-watch" />
            <GameButton label={t('Agora não, girar de novo')} tone="ghost" size="sm" disabled={busy} onPress={() => onClose(false)} testID="prize-face-skip" />
          </GamePanel>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,201,60,0.55)',
    borderStyle: 'dashed',
  },
  done: { borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.15)', justifyContent: 'center' },
  flex: { flex: 1, gap: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,10,30,0.72)', justifyContent: 'center', padding: 20 },
  sheetWrap: { maxWidth: 420, width: '100%', alignSelf: 'center' },
  sheet: { gap: 14, padding: 20 },
  prize: { alignItems: 'center', paddingVertical: 6 },
});
