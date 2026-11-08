/**
 * Um prêmio de anúncio desenhado do mesmo jeito em todo lugar: ícone e texto curto.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { BoostKind, Prize } from '@trivia/shared';
import { StyleSheet, View } from 'react-native';
import { CoinIcon, HeartIcon, ShekelIcon } from '@/components/game/icons';
import { GameText } from '@/components/game/GameText';
import { prizeLabel } from '@/lib/monetization';
import { g } from '@/theme/game';

export const BOOST_ICONS: Readonly<Record<BoostKind, 'time' | 'play-skip-forward' | 'eye-off'>> = {
  time: 'time',
  skip: 'play-skip-forward',
  eliminate: 'eye-off',
};

export function BoostIcon({ kind, size = 22, color = g.gold }: { kind: BoostKind; size?: number; color?: string }) {
  return <Ionicons name={BOOST_ICONS[kind]} size={size} color={color} />;
}

export function PrizeIcon({ prize, size = 26 }: { prize: Prize; size?: number }) {
  switch (prize.kind) {
    case 'coins':
    case 'double':
      return <CoinIcon size={size} />;
    case 'shekels':
      return <ShekelIcon size={size} />;
    case 'life':
    case 'heart':
      return <HeartIcon size={size} />;
    case 'boost':
      return <BoostIcon kind={prize.boost} size={size} />;
    case 'moves':
      return <Ionicons name="swap-horizontal" size={size} color={g.gold} />;
  }
}

export function PrizeBadge({ prize, size = 'md', color = g.white }: { prize: Prize; size?: 'sm' | 'md' | 'lg'; color?: string }) {
  const icon = size === 'lg' ? 40 : size === 'sm' ? 20 : 28;
  return (
    <View style={styles.row} accessible accessibilityLabel={prizeLabel(prize)}>
      <View style={[styles.disc, { width: icon + 14, height: icon + 14, borderRadius: (icon + 14) / 2 }]}>
        <PrizeIcon prize={prize} size={icon} />
      </View>
      <GameText size={size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md'} weight="bold" color={color}>
        {prizeLabel(prize)}
      </GameText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  disc: { backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
});
