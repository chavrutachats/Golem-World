import type { RankingEntry, RankingPeriod } from '@trivia/shared';
import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/Text';
import { errorMessage, useRanking } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/theme';
import { brand, radius, space } from '@/theme/tokens';
import { formatNumber, msg, t } from '@/lib/i18n';

/** Rótulos em português; traduza com t() ao mostrar. */
const PERIODS: { id: RankingPeriod; label: string }[] = [
  { id: 'week', label: msg('Esta semana') },
  { id: 'all', label: msg('Geral') },
];

function Row({ entry, mine }: { entry: RankingEntry; mine: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.row, { borderColor: colors.line }, mine && { backgroundColor: colors.surfaceSunken }]}
      accessible
      accessibilityLabel={t('{position}º lugar, {name}, {points} pontos', { position: entry.position, name: mine ? t('você') : entry.displayName, points: formatNumber(entry.points) })}
    >
      <T variant="lead" weight="bold" style={styles.position} color={entry.position <= 3 ? brand.goldDeep : colors.inkMuted}>
        {entry.position}
      </T>
      <T weight={mine ? 'bold' : 'regular'} style={styles.name} numberOfLines={1}>
        {mine ? t('{name} (você)', { name: entry.displayName }) : entry.displayName}
      </T>
      <T weight="bold" style={styles.points}>
        {formatNumber(entry.points)}
      </T>
    </View>
  );
}

export default function Ranking() {
  const { colors } = useTheme();
  const [period, setPeriod] = useState<RankingPeriod>('week');
  const ranking = useRanking(period);
  const myId = useSession((s) => s.user?.id);
  const entries = ranking.data?.entries ?? [];
  const me = ranking.data?.me ?? null;
  const meListed = !!me && entries.some((e) => e.userId === me.userId);

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={ranking.isRefetching} onRefresh={() => void ranking.refetch()} />}>
      <TopBar title={t('Ranking')} />
      <View style={[styles.tabs, { backgroundColor: colors.surfaceSunken }]} accessibilityRole="tablist">
        {PERIODS.map((p) => {
          const active = p.id === period;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setPeriod(p.id)}
              style={[styles.tab, active && { backgroundColor: colors.surface, borderColor: colors.line }]}
            >
              <T weight={active ? 'bold' : 'medium'} muted={!active}>
                {t(p.label)}
              </T>
            </Pressable>
          );
        })}
      </View>
      <T variant="small" muted style={styles.note}>
        {period === 'week' ? t('Pontos desde segunda-feira. O ranking da semana recomeça toda segunda.') : t('Todos os pontos desde que você começou a jogar.')}
      </T>

      {ranking.isLoading ? (
        <T muted>{t('Carregando…')}</T>
      ) : ranking.error ? (
        <View style={styles.errorBox}>
          <T color={colors.danger}>{errorMessage(ranking.error)}</T>
          <Button label={t('Tentar de novo')} variant="secondary" onPress={() => void ranking.refetch()} />
        </View>
      ) : entries.length === 0 ? (
        <T muted>{period === 'week' ? t('Ninguém pontuou esta semana. Jogue uma partida e apareça aqui.') : t('Ninguém pontuou ainda. Jogue uma partida e apareça aqui.')}</T>
      ) : (
        <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          {entries.map((e) => (
            <Row key={e.userId} entry={e} mine={e.userId === myId} />
          ))}
        </View>
      )}

      {me && !meListed ? (
        <View style={[styles.list, styles.mine, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Row entry={me} mine />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderRadius: radius.pill, padding: 4, marginTop: space.md },
  tab: { flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  note: { marginTop: space.md, marginBottom: space.lg },
  errorBox: { gap: space.md },
  list: { borderRadius: radius.surface, borderWidth: 1, overflow: 'hidden' },
  mine: { marginTop: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  position: { width: 36, fontVariant: ['tabular-nums'] },
  name: { flex: 1 },
  points: { fontVariant: ['tabular-nums'] },
});
