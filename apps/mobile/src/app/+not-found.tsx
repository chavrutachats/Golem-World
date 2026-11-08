import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/Text';
import { space } from '@/theme/tokens';
import { t } from '@/lib/i18n';

export default function NotFound() {
  return (
    <Screen>
      <View style={styles.center}>
        <T variant="title" display align="center">
          {t('Esta tela não existe')}
        </T>
        <T muted align="center">
          {t('O link pode estar incompleto ou a partida pode ter sido apagada.')}
        </T>
        <Button label={t('Ir para o início')} onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: space.lg },
});
