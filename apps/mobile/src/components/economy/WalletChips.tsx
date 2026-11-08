/**
 * Carteira no topo das telas: moedas de sabedoria (ganhas jogando) e shekels. Tocar
 * abre a loja na aba das moedas.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { CoinIcon, ShekelIcon } from '@/components/game/icons';
import { GameText } from '@/components/game/GameText';
import { t } from '@/lib/i18n';
import { useMonetization } from '@/lib/monetization';
import { g } from '@/theme/game';

export function WalletChips({ coins, color = g.white }: { /** Saldo da tela, se ela já tem (mais novo que o da carteira). */ coins?: number; color?: string }) {
  const { economy } = useMonetization();
  const c = coins ?? economy?.wallet.coins;
  const s = economy?.wallet.shekels;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('{coins} moedas de sabedoria e {shekels} shekels. Abrir a loja.', { coins: c ?? 0, shekels: s ?? 0 })}
      onPress={() => router.push('/journey/shop?tab=shekels')}
      hitSlop={6}
      style={styles.row}
      testID="wallet-chips"
    >
      {c !== undefined ? (
        <View style={styles.chip}>
          <CoinIcon size={20} />
          <GameText size="sm" weight="bold" color={color}>
            {c}
          </GameText>
        </View>
      ) : null}
      {s !== undefined ? (
        <View style={styles.chip}>
          <ShekelIcon size={20} />
          <GameText size="sm" weight="bold" color={color}>
            {s}
          </GameText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, paddingStart: 3, paddingEnd: 9, paddingVertical: 2 },
});
