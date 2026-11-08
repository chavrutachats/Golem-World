import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TopBar } from '@/components/TopBar';
import { SocialSignIn } from '@/components/social/SocialSignIn';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { errorMessage } from '@/lib/queries';
import { api } from '@/lib/session';
import { space } from '@/theme/tokens';
import { t } from '@/lib/i18n';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      setError(t('Preencha o e-mail e a senha.'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.auth.login(email.trim(), password);
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  }

  return (
    <Screen scroll>
      <TopBar title={t('Entrar')} />
      <View style={styles.form}>
        <T muted>{t('Entre com o e-mail e a senha que você cadastrou no app.')}</T>
        <TextField
          label={t('E-mail')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextField
          label={t('Senha')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={error}
        />
        <Button label={t('Entrar')} size="lg" onPress={submit} loading={loading} />
        <SocialSignIn />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg, marginTop: space.lg },
});
