/**
 * No iPhone, o botão da Apple é o nativo (AppleAuthenticationButton), como as regras
 * da App Store pedem: texto, logotipo e proporções vêm do sistema, no idioma do aparelho.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { radius } from '@/theme/tokens';
import type { ProviderButtonProps } from './ProviderButton';

export function AppleButton({ onPress, busy, disabled, onDark }: ProviderButtonProps) {
  if (busy) {
    return (
      <View style={[styles.button, styles.busy, { backgroundColor: onDark ? '#FFFFFF' : '#000000' }]}>
        <ActivityIndicator color={onDark ? '#000000' : '#FFFFFF'} />
      </View>
    );
  }
  return (
    <View pointerEvents={disabled ? 'none' : 'auto'} style={disabled ? styles.dim : undefined} testID="social-apple">
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={onDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={radius.control}
        style={styles.button}
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: { height: 50, width: '100%' },
  busy: { borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.5 },
});
