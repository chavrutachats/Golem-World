import { DisplayNameSchema } from '@trivia/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LanguagePicker } from '@/components/LanguagePicker';
import { SocialSignIn } from '@/components/social/SocialSignIn';
import { Sevivon } from '@/components/Sevivon';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { confirmAction } from '@/lib/feedback';
import { errorMessage } from '@/lib/queries';
import { api, bootSession, useSession } from '@/lib/session';
import { brand, space } from '@/theme/tokens';
import { currentLocale, t } from '@/lib/i18n';

export default function Welcome() {
  const { width } = useWindowDimensions();
  const bootError = useSession((s) => s.bootError);
  const pendingRestore = useSession((s) => s.pendingRestore);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(pendingRestore ? null : bootError);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [startFresh, setStartFresh] = useState(false);

  async function retry() {
    setRetrying(true);
    await bootSession();
    setRetrying(false);
  }

  async function confirmFresh() {
    const ok = await confirmAction(
      t('Começar com outra conta?'),
      t('Se você jogava como convidado neste aparelho, perderá o acesso àquela conta e aos pontos dela.'),
      t('Começar do zero'),
      true,
    );
    if (ok) setStartFresh(true);
  }

  async function start() {
    const trimmed = name.trim();
    if (trimmed) {
      const valid = DisplayNameSchema.safeParse(trimmed);
      if (!valid.success) {
        setError(t(valid.error.issues[0]?.message ?? 'Escolha outro nome.'));
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      await api.auth.guest(trimmed || undefined, currentLocale());
      // A navegação muda sozinha quando a sessão começa.
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  }

  return (
    <Screen tone="velvet" scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <View style={styles.wheel}>
          {/* O sevivon paira girando devagar, mostrando as faces dos temas. */}
          <Sevivon size={Math.min(width - space.xxxl * 2, 280)} />
        </View>
        <View style={styles.copy}>
          <T variant="hero" weight="bold" color={brand.onVelvet} accessibilityRole="header">
            {t('Trivia Torá')}
          </T>
          <T variant="lead" color={brand.onVelvetMuted}>
            {t('Gire o sevivon e responda perguntas sobre Torá, Profetas, Mishná, Talmud, Halachá e Midrash, tiradas direto dos textos.')}
          </T>
        </View>
        <View style={styles.language}>
          <LanguagePicker onVelvet />
        </View>
        {pendingRestore && !startFresh ? (
          <View style={styles.form}>
            <T weight="bold" color={brand.onVelvet} accessibilityRole="header">
              {t('Não deu para retomar sua conta agora')}
            </T>
            <T color={brand.onVelvetMuted} accessibilityLiveRegion="polite">
              {bootError ?? t('Confira a conexão e tente de novo.')}
            </T>
            <Button label={t('Tentar de novo')} variant="gold" size="lg" onPress={retry} loading={retrying} />
            <Button label={t('Começar do zero')} variant="onVelvet" onPress={confirmFresh} />
          </View>
        ) : (
          <View style={styles.form}>
            <TextField
              onVelvet
              label={t('Como quer ser chamado no jogo?')}
              placeholder={t('Seu nome ou apelido')}
              value={name}
              onChangeText={setName}
              maxLength={24}
              autoCapitalize="words"
              returnKeyType="go"
              onSubmitEditing={start}
              hint={t('Se deixar em branco, escolhemos um nome para você.')}
              error={error}
            />
            <Button label={t('Começar a jogar')} variant="gold" size="lg" onPress={start} loading={loading} sound="pop" />
            <Button label={t('Já tenho conta')} variant="onVelvet" onPress={() => router.push('/login')} />
            <SocialSignIn onVelvet />
          </View>
        )}
        <T variant="caption" color={brand.onVelvetMuted} align="center" style={styles.footer}>
          {t('Textos do acervo aberto do Sefaria. Este jogo não é um produto do Sefaria.')}
        </T>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wheel: { alignItems: 'center', marginTop: space.xl },
  copy: { gap: space.sm, marginTop: space.xl },
  language: { marginTop: space.lg },
  form: { gap: space.md, marginTop: space.xl },
  footer: { marginTop: 'auto', paddingTop: space.xl, paddingBottom: space.md },
});
