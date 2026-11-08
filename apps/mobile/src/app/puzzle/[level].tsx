/**
 * Uma partida do "Pedras do Choshen". O servidor dá a semente; o tabuleiro roda aqui, e
 * no fim as jogadas vão para o servidor conferir.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { PUZZLE_LEVELS, PUZZLE_RULES, PUZZLE_STONES, puzzleChapter, type PuzzleRun } from '@trivia/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { ZoomIn, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NoAdsButton } from '@/components/economy/NoAdsFab';
import { GameButton } from '@/components/game/GameUI';
import { GameText } from '@/components/game/GameText';
import { PuzzleBoard } from '@/components/puzzle/PuzzleBoard';
import { PuzzleEnd, type EndPhase } from '@/components/puzzle/PuzzleEnd';
import { PuzzleHud, stoneName } from '@/components/puzzle/PuzzleHud';
import { Stone } from '@/components/puzzle/Stone';
import { T } from '@/components/ui/Text';
import { confirmAction } from '@/lib/feedback';
import { t } from '@/lib/i18n';
import { adBreak, applyEconomy, earnReward, useMonetization } from '@/lib/monetization';
import { usePuzzleGame } from '@/lib/puzzle';
import { errorMessage, keys } from '@/lib/queries';
import { api } from '@/lib/session';
import { g } from '@/theme/game';

function leaveTo(path: '/puzzle') {
  if (router.canGoBack()) router.back();
  else router.replace(path);
}

function Play({ run, onReplay }: { run: PuzzleRun; onReplay: () => void }) {
  const qc = useQueryClient();
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const { economy } = useMonetization();
  const game = usePuzzleGame(run, reducedMotion);
  const [phase, setPhase] = useState<EndPhase | null>(null);
  const [extraUsed, setExtraUsed] = useState(run.extraMoves > 0);
  const [extraBusy, setExtraBusy] = useState(false);
  const sent = useRef(false);
  const canExtra = !extraUsed && !!economy && economy.ads.mode !== 'off';

  const send = useCallback(async () => {
    sent.current = true;
    setPhase({ kind: 'checking' });
    try {
      const result = await api.puzzle.finish(run.id, game.moves);
      applyEconomy(result.economy);
      void qc.invalidateQueries({ queryKey: keys.puzzle });
      setPhase({ kind: 'result', result });
    } catch (e) {
      setPhase({ kind: 'error', message: errorMessage(e) });
    }
  }, [game.moves, qc, run.id]);

  // Fim da partida: vitória vai direto para a conferência; sem jogadas, oferece +5 antes.
  useEffect(() => {
    if (game.busy || sent.current) return;
    if (game.state.status === 'won') {
      const timer = setTimeout(() => void send(), reducedMotion ? 100 : 650);
      return () => clearTimeout(timer);
    }
    if (game.state.status === 'lost') {
      if (canExtra) setPhase({ kind: 'out' });
      else void send();
    }
    return undefined;
  }, [game.busy, game.state.status, canExtra, send, reducedMotion]);

  const extra = async () => {
    setExtraBusy(true);
    const outcome = await earnReward('moves', run.id);
    setExtraBusy(false);
    if (outcome === 'claimed') {
      setExtraUsed(true);
      game.grantMoves(PUZZLE_RULES.extraMoves);
      setPhase(null);
    }
  };

  const after = async (go: () => void) => {
    await adBreak('level');
    go();
  };

  const quit = async () => {
    if (game.state.status === 'playing' && !sent.current) {
      if (game.moves.length > 0) {
        const ok = await confirmAction(t('Sair da partida?'), t('As jogadas desta partida não valem estrelas.'), t('Sair'), true);
        if (!ok) return;
      }
      sent.current = true;
      void api.puzzle.finish(run.id, game.moves).catch(() => undefined);
    }
    leaveTo('/puzzle');
  };

  const boardWidth = Math.min(width, 460) - 12;
  const chapter = puzzleChapter(run.level);
  return (
    <>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Sair da partida')} onPress={() => void quit()} hitSlop={10} style={styles.close} testID="puzzle-close">
          <Ionicons name="close" size={26} color={g.white} />
        </Pressable>
        <View style={styles.title}>
          <GameText size="lg" weight="bold" accessibilityRole="header">
            {t('Fase {n}', { n: run.level })}
          </GameText>
          <View style={styles.chapter}>
            <Stone kind={chapter - 1} size={16} />
            <GameText size="xs" color={g.mist}>
              {stoneName(chapter - 1)}
            </GameText>
          </View>
        </View>
        <NoAdsButton />
      </View>
      <View style={styles.play}>
        <View style={styles.hud}>
          <PuzzleHud state={game.state} score={game.frame.score} />
        </View>
        <View style={styles.boardArea}>
          <PuzzleBoard
            frame={game.frame}
            rows={game.state.level.rows}
            cols={game.state.level.cols}
            width={boardWidth}
            hint={game.hint}
            disabled={game.busy || game.state.status !== 'playing'}
            reducedMotion={reducedMotion}
            onSwap={game.swap}
          />
          {game.frame.cascade > 0 ? (
            <Animated.View
              key={game.frame.cascade}
              entering={reducedMotion ? undefined : ZoomIn.springify().damping(12)}
              style={styles.combo}
              pointerEvents="none"
              accessibilityLiveRegion="polite"
            >
              <GameText size="xxl" weight="bold" color={g.gold} shadow>
                {`×${game.frame.cascade + 1}`}
              </GameText>
            </Animated.View>
          ) : null}
        </View>
      </View>
      {phase ? (
        <PuzzleEnd
          phase={phase}
          state={game.state}
          canExtra={canExtra}
          extraBusy={extraBusy}
          hasNext={run.level < PUZZLE_LEVELS}
          onExtra={() => void extra()}
          onGiveUp={() => void send()}
          onRetrySend={() => void send()}
          onNext={() => void after(() => router.replace({ pathname: '/puzzle/[level]', params: { level: String(run.level + 1) } }))}
          onReplay={() => void after(onReplay)}
          onMap={() => void after(() => leaveTo('/puzzle'))}
        />
      ) : null}
    </>
  );
}

export default function PuzzleLevelScreen() {
  const params = useLocalSearchParams<{ level: string }>();
  const level = Number(params.level);
  const valid = Number.isInteger(level) && level >= 1 && level <= PUZZLE_LEVELS;
  const [attempt, setAttempt] = useState(0);
  const [run, setRun] = useState<PuzzleRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    setRun(null);
    setError(null);
    api.puzzle
      .start(level)
      .then((r) => alive && setRun(r))
      .catch((e: unknown) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [level, valid, attempt]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.fill}>
      <StatusBar style="light" />
      {run ? (
        <Play key={run.id} run={run} onReplay={() => setAttempt((a) => a + 1)} />
      ) : (
        <View style={styles.loading}>
          {error || !valid ? (
            <>
              <T color={g.white} align="center" accessibilityLiveRegion="polite">
                {error ?? t('Esta fase não existe.')}
              </T>
              <GameButton label={t('Voltar ao mapa')} onPress={() => leaveTo('/puzzle')} />
            </>
          ) : (
            <>
              <View style={styles.stones}>
                {PUZZLE_STONES.map((s, i) => (
                  <Stone key={s.id} kind={i} size={30} />
                ))}
              </View>
              <ActivityIndicator color={g.gold} />
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: g.velvetDeep },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 6 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, alignItems: 'center' },
  chapter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  /** Placar e tabuleiro juntos, no meio da tela que sobra. */
  play: { flex: 1, justifyContent: 'center', gap: 14, paddingBottom: 12 },
  hud: { paddingHorizontal: 14, width: '100%', maxWidth: 480, alignSelf: 'center' },
  boardArea: { justifyContent: 'center' },
  combo: {
    position: 'absolute',
    alignSelf: 'center',
    top: '38%',
    paddingHorizontal: 18,
    paddingVertical: 4,
    borderRadius: 22,
    backgroundColor: 'rgba(19,28,85,0.72)',
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  stones: { flexDirection: 'row', gap: 6 },
});
