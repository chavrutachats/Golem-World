/**
 * Escolha do idioma (Fase 8): português, inglês ou hebraico. Vale para a interface
 * e para tudo o que aparece nas fases e partidas. Com a conta já criada, a escolha
 * também vai para o servidor, que monta as perguntas nesse idioma.
 */
import { LOCALES, LOCALE_INFO, type Locale } from '@trivia/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { T } from '@/components/ui/Text';
import { setLocale, t, useLocaleValue } from '@/lib/i18n';
import { play } from '@/lib/sound';
import { brand, radius, space } from '@/theme/tokens';

export function LanguagePicker({ onVelvet = false, onChange }: { onVelvet?: boolean; onChange?: (locale: Locale) => void }) {
  const current = useLocaleValue();
  return (
    <View style={styles.wrap}>
      <T variant="caption" weight="bold" color={onVelvet ? brand.onVelvetMuted : undefined} muted={!onVelvet}>
        {t('Idioma')}
      </T>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('Idioma')}>
        {LOCALES.map((l) => {
          const selected = l === current;
          return (
            <Pressable
              key={l}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={LOCALE_INFO[l].nativeName}
              onPress={() => {
                if (selected) return;
                play('tick');
                onChange?.(l);
                setLocale(l);
              }}
              testID={`locale-${l}`}
              style={[
                styles.chip,
                onVelvet ? styles.chipVelvet : styles.chipLight,
                selected && (onVelvet ? styles.selectedVelvet : styles.selectedLight),
              ]}
            >
              <T weight="bold" color={selected ? brand.onGold : onVelvet ? brand.onVelvet : undefined}>
                {LOCALE_INFO[l].nativeName}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  chip: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, borderWidth: 2 },
  chipVelvet: { borderColor: 'rgba(255,255,255,0.35)' },
  chipLight: { borderColor: 'rgba(22,37,95,0.25)' },
  selectedVelvet: { backgroundColor: brand.gold, borderColor: brand.gold },
  selectedLight: { backgroundColor: brand.gold, borderColor: brand.gold },
});
