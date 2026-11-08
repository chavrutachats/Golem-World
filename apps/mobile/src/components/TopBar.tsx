import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { brand, space } from '@/theme/tokens';
import { T } from './ui/Text';
import { t } from '@/lib/i18n';

export function TopBar({ title, onVelvet, right, onBack }: { title?: string; onVelvet?: boolean; right?: ReactNode; onBack?: () => void }) {
  const { colors } = useTheme();
  const color = onVelvet ? brand.onVelvet : colors.ink;
  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Voltar')}
        hitSlop={12}
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        style={styles.side}
      >
        <Ionicons name="chevron-back" size={28} color={color} />
      </Pressable>
      <T variant="title" display color={color} style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title ?? ''}
      </T>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: space.sm },
  side: { width: 44, height: 44, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
});
