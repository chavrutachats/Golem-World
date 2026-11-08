/**
 * "Continuar com o Google / a Apple / o Facebook" nas telas de entrada. Só aparecem os
 * logins que o servidor aceita e que funcionam neste aparelho; sem nenhum, nada aparece.
 */
import type { SocialProvider } from '@trivia/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { T } from '@/components/ui/Text';
import { msg, t } from '@/lib/i18n';
import { errorMessage } from '@/lib/queries';
import { signInWith, useSocialProviders } from '@/lib/social';
import { useTheme } from '@/theme/theme';
import { brand, space } from '@/theme/tokens';
import { AppleButton } from './AppleButton';
import { ProviderButton } from './ProviderButton';

export const CONTINUE_WITH: Readonly<Record<SocialProvider, string>> = {
  google: msg('Continuar com o Google'),
  apple: msg('Continuar com a Apple'),
  facebook: msg('Continuar com o Facebook'),
};

export function SocialSignIn({ onVelvet }: { onVelvet?: boolean }) {
  const { colors } = useTheme();
  const providers = useSocialProviders();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!providers.data?.length) return null;

  const go = async (provider: SocialProvider) => {
    setBusy(provider);
    setError(null);
    try {
      await signInWith(provider);
      // A sessão começa e a navegação vai sozinha para o início.
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const lineColor = onVelvet ? brand.velvetLine : colors.line;
  return (
    <View style={styles.wrap} testID="social-sign-in">
      <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.rule, { backgroundColor: lineColor }]} />
        <T variant="small" color={onVelvet ? brand.onVelvetMuted : colors.inkMuted}>
          {t('ou')}
        </T>
        <View style={[styles.rule, { backgroundColor: lineColor }]} />
      </View>
      {providers.data.map((p) => {
        const Btn = p === 'apple' ? AppleButton : ProviderButton;
        return <Btn key={p} provider={p} label={t(CONTINUE_WITH[p])} onPress={() => void go(p)} busy={busy === p} disabled={!!busy && busy !== p} onDark={!!onVelvet} />;
      })}
      {error ? (
        <T variant="small" color={onVelvet ? brand.gold : colors.danger} accessibilityLiveRegion="polite" testID="social-error">
          {error}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginVertical: space.xs },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});
