/**
 * Placar do "Pedras do Choshen": jogadas que sobram, objetivos e a barra de pontos com
 * as estrelas.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { PUZZLE_STONES, goalProgress, type GoalProgress, type PuzzleLevel, type PuzzleState } from '@trivia/shared';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { StarIcon } from '@/components/game/icons';
import { GameText } from '@/components/game/GameText';
import { formatNumber, t, tc } from '@/lib/i18n';
import { g } from '@/theme/game';
import { ClayPatch, Stone } from './Stone';

export function stoneName(kind: number): string {
  return tc(PUZZLE_STONES[kind]?.name ?? '');
}

export function GoalChip({ progress, size = 30 }: { progress: GoalProgress; size?: number }) {
  const { goal, remaining } = progress;
  const done = remaining === 0;
  const label =
    goal.type === 'collect'
      ? t('{name}: faltam {n}', { name: stoneName(goal.kind), n: remaining })
      : goal.type === 'clay'
        ? t('Barro: faltam {n} casas', { n: remaining })
        : t('Pontos: faltam {n}', { n: remaining });
  return (
    <View style={styles.chip} accessible accessibilityLabel={done ? `${label}. ${t('Feito!')}` : label}>
      {goal.type === 'collect' ? (
        <Stone kind={goal.kind} size={size} />
      ) : goal.type === 'clay' ? (
        <ClayPatch hp={1} size={size} />
      ) : (
        <StarIcon size={size - 4} />
      )}
      {done ? (
        <View style={styles.check}>
          <Ionicons name="checkmark" size={16} color={g.ink} />
        </View>
      ) : (
        <GameText size="md" weight="bold" style={styles.count}>
          {goal.type === 'score' ? formatNumber(remaining) : remaining}
        </GameText>
      )}
    </View>
  );
}

function ScoreBar({ level, score }: { level: PuzzleLevel; score: number }) {
  const max = level.stars[1];
  const p = useSharedValue(Math.min(1, score / max));
  useEffect(() => {
    p.value = withTiming(Math.min(1, score / max), { duration: 300 });
  }, [score, max, p]);
  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  const twoAt = level.stars[0] / max;
  return (
    <View style={styles.scoreRow} accessible accessibilityLabel={t('{n} pontos', { n: formatNumber(score) })}>
      <GameText size="lg" weight="bold" style={styles.score} testID="puzzle-score">
        {formatNumber(score)}
      </GameText>
      <View style={styles.bar}>
        <Animated.View style={[styles.fill, fill]} />
        {/* Posições lógicas (start): no hebraico a barra enche da direita para a esquerda. */}
        <View style={[styles.notch, { start: `${twoAt * 100}%` }]}>
          <StarIcon size={18} dim={score < level.stars[0]} />
        </View>
        <View style={[styles.notch, { start: '100%' }]}>
          <StarIcon size={18} dim={score < level.stars[1]} />
        </View>
      </View>
    </View>
  );
}

export function PuzzleHud({ state, score }: { state: PuzzleState; score: number }) {
  const progress = goalProgress(state);
  const low = state.movesLeft <= 3 && state.status === 'playing';
  return (
    <View style={styles.wrap}>
      <View style={[styles.moves, low && styles.movesLow]} accessible accessibilityLabel={t('{n} jogadas', { n: state.movesLeft })} testID="puzzle-moves">
        <GameText size="xxl" weight="bold" color={g.ink} style={styles.movesNumber}>
          {state.movesLeft}
        </GameText>
        <GameText size="xs" color={g.ink}>
          {t('jogadas')}
        </GameText>
      </View>
      <View style={styles.right}>
        <View style={styles.goals} testID="puzzle-goals">
          {progress.map((p, i) => (
            <GoalChip key={i} progress={p} />
          ))}
        </View>
        <ScoreBar level={state.level} score={score} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  moves: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: g.gold,
    borderBottomWidth: 5,
    borderBottomColor: g.goldDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movesLow: { backgroundColor: '#FF9A7A', borderBottomColor: g.redDeep },
  movesNumber: { lineHeight: 42 },
  right: { flex: 1, gap: 10 },
  goals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingStart: 4,
    paddingEnd: 10,
    paddingVertical: 3,
    borderRadius: 18,
    backgroundColor: 'rgba(19,28,85,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  count: { minWidth: 18, textAlign: 'center' },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: g.green, alignItems: 'center', justifyContent: 'center', marginStart: 2 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  score: { minWidth: 64, fontVariant: ['tabular-nums'] },
  bar: { flex: 1, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.15)', marginEnd: 10 },
  fill: { height: 12, borderRadius: 6, backgroundColor: g.gold },
  notch: { position: 'absolute', top: -4, marginStart: -9 },
});
