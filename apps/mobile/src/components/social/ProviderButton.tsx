/**
 * Botão de um provedor de login, nas cores que o provedor pede (Google em branco,
 * Facebook no azul dele). A Apple usa o botão nativo dela no iPhone (AppleButton.ios).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { SocialProvider } from '@trivia/shared';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { T } from '@/components/ui/Text';
import { radius, space } from '@/theme/tokens';

const LOOK: Readonly<Record<SocialProvider, { icon: keyof typeof Ionicons.glyphMap; face: string; fg: string; border: string }>> = {
  google: { icon: 'logo-google', face: '#FFFFFF', fg: '#1F1F1F', border: '#747775' },
  apple: { icon: 'logo-apple', face: '#000000', fg: '#FFFFFF', border: '#000000' },
  facebook: { icon: 'logo-facebook', face: '#1877F2', fg: '#FFFFFF', border: '#1877F2' },
};

export interface ProviderButtonProps {
  provider: SocialProvider;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  /** Sobre fundo escuro, o botão da Apple fica branco. */
  onDark?: boolean;
}

export function ProviderButton({ provider, label, onPress, busy, disabled, onDark }: ProviderButtonProps) {
  const look = provider === 'apple' && onDark ? { ...LOOK.apple, face: '#FFFFFF', fg: '#000000', border: '#FFFFFF' } : LOOK[provider];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      testID={`social-${provider}`}
      style={({ pressed }) => [styles.button, { backgroundColor: look.face, borderColor: look.border }, pressed && styles.pressed, disabled && !busy && styles.dim]}
    >
      <View style={styles.icon}>{busy ? <ActivityIndicator color={look.fg} /> : <Ionicons name={look.icon} size={20} color={look.fg} />}</View>
      <T weight="bold" color={look.fg} numberOfLines={1} style={styles.label}>
        {label}
      </T>
      <View style={styles.icon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', height: 50, borderRadius: radius.control, borderWidth: 1, paddingHorizontal: space.lg },
  icon: { width: 24, alignItems: 'center' },
  label: { flex: 1, textAlign: 'center' },
  pressed: { opacity: 0.85 },
  dim: { opacity: 0.5 },
});
