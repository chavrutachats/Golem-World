/**
 * Fim da partida: as jogadas acabaram (com a opção do anúncio "+5 jogadas"), a conferência
 * no servidor e o resultado (estrelas, pontos, moedas).
 */
import { goalProgress, type PuzzleFinishResult, type PuzzleState } from '@trivia/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn, useReducedMotion } from 'react-native-reanimated';
import { Confetti } from '@/components/fx/Confetti';
import { CoinIcon, StarIcon } from '@/components/game/icons';
import { GameButton, GamePanel } from '@/components/game/GameUI';
import { GameText } from '@/components/game/GameText';
import { T } from '@/components/ui/Text';
import { formatNumber, t, tn } from '@/lib/i18n';
import { g } from '@/theme/game';
import { GoalChip } from './PuzzleHud';
import { STONE_COLORS } from './Stone';

const CONFETTI = STONE_COLORS.map((c) => c.base);

export type EndPhase =
  | { kind: 'out' }
  | { kind: 'checking' }
  | { kind: 'result'; result: PuzzleFinishResult }
  | { kind: 'error'; message: string };

export function PuzzleEnd({
  phase,
  state,
  canExtra,
  extraBusy,
  hasNext,
  onExtra,
  onGiveUp,
  onRetrySend,
  onNext,
  onReplay,
  onMap,
}: {
  phase: EndPhase;
  state: PuzzleState;
  canExtra: boolean;
  extraBusy: boolean;
  hasNext: boolean;
  onExtra: () => void;
  onGiveUp: () => void;
  onRetrySend: () => void;
  onNext: () => void;
  onReplay: () => void;
  onMap: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [burst, setBurst] = useState(0);
  const won = phase.kind === 'result' && phase.result.status === 'won';
  useEffect(() => {
    if (won) setBurst((b) => b + 1);
  }, [won]);

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.backdrop} testID="puzzle-end">
      <View style={styles.center}>
        <GamePanel style={styles.panel}>
          {phase.kind === 'out' ? (
            <>
              <GameText size="xl" align="center" accessibilityRole="header">
                {t('Acabaram as jogadas')}
              </GameText>
              <T color={g.mist} align="center">
                {t('Ainda faltam:')}
              </T>
              <View style={styles.goals}>
                {goalProgress(state).map((p, i) => (
                  <GoalChip key={i} progress={p} />
                ))}
              </View>
              {canExtra ? (
                <GameButton
                  label={t('+5 jogadas')}
                  icon="play"
                  tone="green"
                  loading={extraBusy}
                  onPress={onExtra}
                  accessibilityHint={t('Assista a um anúncio e continue a partida com mais 5 jogadas')}
                  testID="puzzle-extra"
                />
              ) : null}
              <GameButton label={t('Encerrar a partida')} tone="ghost" size="sm" disabled={extraBusy} onPress={onGiveUp} testID="puzzle-give-up" />
            </>
          ) : phase.kind === 'checking' ? (
            <View style={styles.checking}>
              <ActivityIndicator color={g.gold} size="large" />
              <T color={g.mist} align="center">
                {t('Conferindo a partida…')}
              </T>
            </View>
          ) : phase.kind === 'error' ? (
            <>
              <GameText size="lg" align="center" accessibilityRole="header">
                {t('Não deu para salvar o resultado')}
              </GameText>
              <T color={g.mist} align="center" accessibilityLiveRegion="polite">
                {phase.message}
              </T>
              <GameButton label={t('Tentar de novo')} onPress={onRetrySend} />
              <GameButton label={t('Voltar ao mapa')} tone="ghost" size="sm" onPress={onMap} />
            </>
          ) : (
            <>
              <GameText size="xl" align="center" accessibilityRole="header" testID={won ? 'puzzle-won' : 'puzzle-lost'}>
                {won ? t('Fase concluída!') : t('Não foi desta vez')}
              </GameText>
              {won ? (
                <View style={styles.stars} accessibilityLabel={t('{n} de {max} estrelas', { n: phase.result.stars, max: 3 })}>
                  {[0, 1, 2].map((i) => (
                    <Animated.View key={i} entering={reducedMotion ? undefined : ZoomIn.delay(250 + i * 240).springify().damping(9)}>
                      <StarIcon size={54} dim={i >= phase.result.stars} />
                    </Animated.View>
                  ))}
                </View>
              ) : (
                <View style={styles.goals}>
                  {goalProgress(state).map((p, i) => (
                    <GoalChip key={i} progress={p} />
                  ))}
                </View>
              )}
              <GameText size="lg" align="center" color={g.gold}>
                {t('{n} pontos', { n: formatNumber(phase.result.score) })}
              </GameText>
              {phase.result.coins > 0 ? (
                <View style={styles.coins}>
                  <CoinIcon size={28} />
                  <GameText size="lg" weight="bold">
                    {tn(phase.result.coins, '+{n} moeda', '+{n} moedas')}
                  </GameText>
                </View>
              ) : won && phase.result.bestStars > phase.result.stars ? (
                <T variant="small" color={g.mist} align="center">
                  {t('Seu recorde nesta fase: {n} estrelas.', { n: phase.result.bestStars })}
                </T>
              ) : null}
              {won && hasNext ? <GameButton label={t('Próxima fase')} size="lg" tone="green" onPress={onNext} testID="puzzle-next" /> : null}
              {!won ? <GameButton label={t('Jogar de novo')} size="lg" onPress={onReplay} testID="puzzle-replay" /> : null}
              {won ? <GameButton label={t('Jogar de novo')} tone="ghost" size="sm" onPress={onReplay} /> : null}
              <GameButton label={t('Voltar ao mapa')} tone="ghost" size="sm" onPress={onMap} testID="puzzle-map" />
            </>
          )}
        </GamePanel>
      </View>
      <Confetti burst={burst} colors={CONFETTI} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,10,30,0.72)' },
  center: { flex: 1, justifyContent: 'center', padding: 16 },
  panel: { gap: 14, padding: 20, width: '100%', maxWidth: 420, alignSelf: 'center' },
  goals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  checking: { gap: 12, paddingVertical: 20, alignItems: 'center' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  coins: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
