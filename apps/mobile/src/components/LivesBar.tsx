/**
 * Vidas da roleta: cada erro gasta uma, e uma volta a cada 10 minutos. Mostra os
 * corações e quanto falta para a próxima vida (contando no relógio do aparelho a
 * partir do horário que a API mandou).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Lives } from '@trivia/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { T } from '@/components/ui/Text';
import { formatWait } from '@/lib/lives';
import { t } from '@/lib/i18n';

export { formatWait };

export function useNextLifeCountdown(lives: Lives | undefined, onRegen?: () => void): number | null {
  const [now, setNow] = useState(() => Date.now());
  const next = lives?.nextLifeAt ? Date.parse(lives.nextLifeAt) : null;
  useEffect(() => {
    if (!next) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [next]);
  const left = next ? next - now : null;
  useEffect(() => {
    if (left !== null && left <= 0) onRegen?.();
    // Só quando cruza o zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left !== null && left <= 0]);
  return left;
}

export function LivesBar({ lives, color, mutedColor, onRegen }: { lives: Lives; color: string; mutedColor: string; onRegen?: () => void }) {
  const left = useNextLifeCountdown(lives, onRegen);
  return (
    <View
      style={styles.row}
      accessibilityRole="text"
      accessibilityLabel={`${t('{n} de {max} vidas', { n: lives.lives, max: lives.max })}${left !== null && left > 0 ? `. ${t('Próxima em {time}', { time: formatWait(left) })}` : ''}`}
      testID="lives-bar"
    >
      <View style={styles.hearts}>
        {Array.from({ length: lives.max }, (_, i) => (
          <Ionicons key={i} name={i < lives.lives ? 'heart' : 'heart-outline'} size={18} color={i < lives.lives ? '#E43B44' : mutedColor} />
        ))}
      </View>
      <T variant="caption" color={lives.lives < lives.max ? color : mutedColor}>
        {lives.lives >= lives.max ? t('Vidas cheias') : left !== null && left > 0 ? t('+1 vida em {time}', { time: formatWait(left) }) : t('Recarregando…')}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hearts: { flexDirection: 'row', gap: 2 },
});
