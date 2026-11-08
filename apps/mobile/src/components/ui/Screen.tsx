import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme/theme';
import { brand, space } from '@/theme/tokens';

export interface ScreenProps {
  children: ReactNode;
  /** "velvet": o fundo das telas de jogo (hoje igual ao das outras: a noite de tekhelet). */
  tone?: 'paper' | 'velvet';
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}

/** Largura máxima do conteúdo: no tablet e na web o jogo fica numa coluna de celular. */
export const CONTENT_MAX_WIDTH = 520;

export function Screen({ children, tone = 'paper', scroll = false, edges = ['top', 'bottom'], contentStyle, refreshControl }: ScreenProps) {
  const { colors, scheme } = useTheme();
  const background = tone === 'velvet' ? brand.velvetDeep : colors.background;
  const inner = <View style={[styles.column, contentStyle]}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: background }]}>
      <StatusBar style={tone === 'velvet' || scheme === 'dark' ? 'light' : 'dark'} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          {...(refreshControl ? { refreshControl } : {})}
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1 },
  column: {
    flexGrow: 1,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
  },
});
