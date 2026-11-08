import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import type { SoundName } from '@/lib/sound';
import { useTheme } from '@/theme/theme';
import { brand, radius, space } from '@/theme/tokens';
import { Chunky, shade } from './Chunky';
import { T } from './Text';

export type ButtonVariant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger' | 'onVelvet';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  /** Pulsa devagar para chamar atenção (ex.: "Girar" na sua vez). */
  pulse?: boolean;
  /** Som de jogo ao tocar. */
  sound?: SoundName;
  testID?: string;
}

/**
 * Botão do app. Os de ação (primário, dourado, sobre o veludo) são peças 3D que
 * afundam ao toque; secundário e perigo têm rebordo discreto; "ghost" é só texto.
 */
export function Button({ label, onPress, variant = 'primary', size = 'md', loading, disabled, icon, style, accessibilityHint, pulse, sound, testID }: ButtonProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const inactive = disabled || loading;

  const palette: Record<Exclude<ButtonVariant, 'ghost'>, { face: string; lip: string; fg: string; border?: string }> = {
    primary: { face: colors.accent, lip: shade(colors.accent, -0.45), fg: colors.onAccent },
    gold: { face: brand.gold, lip: brand.goldDeep, fg: brand.onGold },
    onVelvet: { face: brand.velvetRaised, lip: brand.velvetDeep, fg: brand.onVelvet, border: brand.velvetLine },
    secondary: { face: colors.surface, lip: colors.line, fg: colors.ink, border: colors.line },
    danger: { face: colors.surface, lip: shade(colors.danger, -0.2), fg: colors.danger, border: colors.danger },
  };

  // Pulso de atenção, só enquanto o botão estiver disponível.
  const breathe = useSharedValue(1);
  useEffect(() => {
    if (pulse && !inactive && !reducedMotion) {
      breathe.value = withRepeat(withSequence(withTiming(1.045, { duration: 650 }), withTiming(1, { duration: 650 })), -1);
    } else {
      cancelAnimation(breathe);
      breathe.value = withTiming(1, { duration: 150 });
    }
  }, [pulse, inactive, reducedMotion, breathe]);
  const breatheStyle = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }));

  const a11y = {
    accessibilityRole: 'button' as const,
    accessibilityLabel: label,
    ...(accessibilityHint ? { accessibilityHint } : {}),
    accessibilityState: { disabled: !!inactive, busy: !!loading },
    ...(testID ? { testID } : {}),
  };

  if (variant === 'ghost') {
    return (
      <Pressable {...a11y} disabled={inactive} onPress={onPress} style={({ pressed }) => [styles.ghost, pressed && styles.ghostPressed, style]}>
        <T variant={size === 'lg' ? 'lead' : 'body'} weight="semibold">
          {label}
        </T>
      </Pressable>
    );
  }

  const p = palette[variant];
  const content = loading ? (
    <ActivityIndicator color={p.fg} />
  ) : (
    <View style={styles.row}>
      {icon}
      <T variant={size === 'lg' ? 'lead' : 'body'} weight="semibold" color={p.fg}>
        {label}
      </T>
    </View>
  );

  return (
    <Animated.View style={[breatheStyle, disabled && !loading && styles.inactive, style]}>
      <Chunky
        {...a11y}
        {...(sound ? { sound } : {})}
        disabled={inactive}
        onPress={onPress}
        face={p.face}
        lip={p.lip}
        border={p.border ?? p.face}
        borderWidth={p.border ? 1.5 : 0}
        radius={radius.button}
        lipHeight={variant === 'secondary' || variant === 'danger' ? 2 : size === 'lg' ? 4 : 3}
        sheen={variant !== 'secondary' && variant !== 'danger'}
        faceStyle={[styles.face, size === 'lg' ? styles.lg : styles.md]}
      >
        {content}
      </Chunky>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  face: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  md: { minHeight: 48 },
  lg: { minHeight: 56 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  inactive: { opacity: 0.5 },
  ghost: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, borderRadius: radius.button },
  ghostPressed: { opacity: 0.6 },
});
