import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { errorMessage, keys } from '@/lib/queries';
import { api } from '@/lib/session';
import { space } from '@/theme/tokens';
import { t } from '@/lib/i18n';

export default function Join() {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  async function join() {
    if (clean.length !== 6) {
      setError(t('O código tem 6 letras e números.'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const game = await api.games.create('friend', clean);
      qc.setQueryData(keys.game(game.id), game);
      void qc.invalidateQueries({ queryKey: keys.games });
      router.replace(`/game/${game.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  }

  return (
    <Screen scroll>
      <TopBar title={t('Entrar com código')} />
      <View style={styles.form}>
        <T muted>{t('Peça ao seu amigo o código que aparece na tela da partida dele.')}</T>
        <TextField
          label={t('Código do convite')}
          value={clean}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          placeholder={t('Ex.: {code}', { code: 'K7Q2PM' })}
          returnKeyType="go"
          onSubmitEditing={join}
          error={error}
        />
        <Button label={t('Entrar na partida')} size="lg" onPress={join} loading={loading} disabled={clean.length !== 6} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg, marginTop: space.lg },
});
