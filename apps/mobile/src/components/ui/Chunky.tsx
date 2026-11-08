/**
 * Peça "de jogo": uma face sobre um rebordo fino mais escuro, que afunda quando tocada.
 * Um fio claro no alto da face dá o volume (sem sombra projetada). Base dos botões, das
 * alternativas e dos cartões de jogo.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptic } from '@/lib/feedback';
import { LIP, springs } from '@/lib/motion';
import { play, type SoundName } from '@/lib/sound';

export interface ChunkyProps extends AccessibilityProps {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** Cor da face e do rebordo (normalmente um tom mais escuro da face). */
  face: string;
  lip: string;
  border?: string;
  borderWidth?: number;
  radius: number;
  /** Altura do rebordo; 0 = peça plana (só encolhe um pouco ao tocar). */
  lipHeight?: number;
  /** Som e vibração ao tocar (para ações de jogo). */
  sound?: SoundName;
  /** Fio claro no alto da face (o "brilho" da peça). Padrão: ligado. */
  sheen?: boolean;
  style?: StyleProp<ViewStyle>;
  faceStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Chunky({
  children,
  onPress,
  disabled,
  face,
  lip,
  border,
  borderWidth = 0,
  radius,
  lipHeight = LIP,
  sound,
  sheen = true,
  style,
  faceStyle,
  ...a11y
}: ChunkyProps) {
  const down = useSharedValue(0);
  const faceAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: down.value * Math.max(lipHeight - 1, 0) }, { scale: lipHeight === 0 ? 1 - down.value * 0.03 : 1 }],
  }));

  return (
    <Pressable
      {...a11y}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        down.value = withSpring(1, springs.press);
        if (sound) {
          haptic.tap();
          play(sound);
        }
      }}
      onPressOut={() => {
        down.value = withSpring(0, springs.pop);
      }}
      style={[{ paddingBottom: lipHeight }, style]}
    >
      {lipHeight > 0 ? <View style={[StyleSheet.absoluteFill, { top: lipHeight, backgroundColor: lip, borderRadius: radius }]} /> : null}
      <Animated.View
        style={[
          { backgroundColor: face, borderRadius: radius, borderColor: border ?? face, borderWidth },
          faceStyle,
          faceAnim,
        ]}
      >
        {sheen ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sheen, { borderRadius: radius }]} /> : null}
        {children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheen: { borderTopWidth: 1, borderLeftWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderColor: 'transparent', borderTopColor: 'rgba(255,255,255,0.26)' },
});

export { shade } from '@/lib/color';
