/**
 * Uma fase do Golem World. O Golem anda pelo cenário da parashá; a cada obstáculo,
 * uma pergunta. Acertou rápido, pulo perfeito; acertou no fim do tempo, passa
 * raspando; errou, tropeça e perde um coração (e vem outra pergunta para o mesmo
 * obstáculo). Sem corações, a fase acaba. Quem decide tudo é o servidor; a tela só
 * anima o que ele respondeu.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { shortRef, type JourneyAnswerResult, type JourneyQuestion, type JourneyPower, type JourneyRun, type PowerUpResult, type PrepStatus } from '@trivia/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { FloatUp } from '@/components/fx/FloatUp';
import { CompletionOverlay, FailedOverlay } from '@/components/journey/LevelEnd';
import { PrepOverlay } from '@/components/PrepOverlay';
import { FeedbackPanel, QuestionCard } from '@/components/journey/QuestionCard';
import { LEVEL_CHANNELS, LevelScene3D, type LevelChannel } from '@/components/journey/LevelScene3D';
import { Coins, GameButton, GamePanel, Hearts } from '@/components/game/GameUI';
import { GameText } from '@/components/game/GameText';
import { FlagIcon } from '@/components/game/icons';
import { CONTENT_MAX_WIDTH } from '@/components/ui/Screen';
import { T } from '@/components/ui/Text';
import { ApiError } from '@/lib/api-core';
import { clockOffsetMs } from '@/lib/countdown';
import { confirmAction, haptic, sleep } from '@/lib/feedback';
import { goalOf, levelInfo, obstacleAt, stageAt } from '@/lib/journey-level';
import { adBreak, earnReward, useMonetization } from '@/lib/monetization';
import { NoAdsButton } from '@/components/economy/NoAdsFab';
import { errorMessage, keys, useJourney } from '@/lib/queries';
import { waitForPrep } from '@/lib/prep';
import { api } from '@/lib/session';
import { play } from '@/lib/sound';
import { SceneDirector, ease } from '@/three/director';
import type { GolemPose } from '@/three/golem';
import { LEVEL } from '@/three/level';
import { g as px } from '@/theme/game';
import { currentLocale, t, tc } from '@/lib/i18n';

type Phase = 'loading' | 'preparing' | 'unavailable' | 'walking' | 'question' | 'answering' | 'feedback' | 'goal' | 'complete' | 'failed' | 'error';

export default function RunScreen() {
  const { id: runId } = useLocalSearchParams<{ id: string }>();
  const { width: winW } = useWindowDimensions();
  const width = Math.min(winW, CONTENT_MAX_WIDTH);
  const reducedMotion = useReducedMotion();
  const qc = useQueryClient();
  const journey = useJourney();
  const look = journey.data?.golem;

  const [run, setRun] = useState<JourneyRun | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [question, setQuestion] = useState<{ q: JourneyQuestion; offset: number } | null>(null);
  const [result, setResult] = useState<JourneyAnswerResult | null>(null);
  const [completion, setCompletion] = useState<JourneyAnswerResult['completion']>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [eliminated, setEliminated] = useState<number[]>([]);
  const [hint, setHint] = useState<PowerUpResult['hint'] | null>(null);
  const [pose, setPose] = useState<GolemPose>('idle');
  const [visualIndex, setVisualIndex] = useState(0);
  const [caption, setCaption] = useState<string | null>(null);
  const [showGoal, setShowGoal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyPower, setBusyPower] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [reviving, setReviving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { ads } = useMonetization();
  const [coinFx, setCoinFx] = useState<{ key: number; text: string } | null>(null);
  const [prep, setPrep] = useState<PrepStatus | null>(null);
  const lastStageCaption = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  // Canais animados da cena 3D (posição do obstáculo, pulo, tropeço, rolagem do chão).
  const director = useMemo(() => new SceneDirector<LevelChannel>(LEVEL_CHANNELS), []);
  useEffect(() => () => director.finishAll(), [director]);

  const nodeId = run?.nodeId ?? '';
  const info = useMemo(() => (nodeId ? levelInfo(nodeId) : null), [nodeId]);
  const count = run?.obstacleCount ?? 1;
  const stage = useMemo(() => (nodeId ? stageAt(nodeId, visualIndex, count) : { sky: 'day' as const, ground: 'grass' as const, props: [] }), [nodeId, visualIndex, count]);
  const obstacle = useMemo(() => (nodeId ? obstacleAt(nodeId, visualIndex, count) : null), [nodeId, visualIndex, count]);
  const goal = useMemo(() => (nodeId ? goalOf(nodeId) : null), [nodeId]);

  const flashCaption = useCallback((text: string, ms = 2200) => {
    setCaption(text);
    setTimeout(() => alive.current && setCaption((c) => (c === text ? null : c)), ms);
  }, []);

  // --------------------------------------------------------------- animações

  /** O Golem anda e o próximo obstáculo chega pela direita. */
  const approach = useCallback(
    async (index: number, node: string, total: number) => {
      const st = stageAt(node, index, total);
      if (st.captionPt && st.captionPt !== lastStageCaption.current) {
        lastStageCaption.current = st.captionPt;
        flashCaption(tc(st.captionPt), 2600);
      }
      setVisualIndex(index);
      director.set('obstacleX', LEVEL.spawnX);
      const ms = reducedMotion ? 0 : 1100;
      setPose('walk');
      await Promise.all([
        director.to('obstacleX', LEVEL.stopX, ms),
        director.to('scroll', director.get('scroll') + (LEVEL.spawnX - LEVEL.stopX), ms),
      ]);
      if (alive.current) setPose('idle');
    },
    [director, flashCaption, reducedMotion],
  );

  const jumpOver = useCallback(async () => {
    play('jump');
    haptic.success();
    setPose('jump');
    const up = reducedMotion ? 0 : 280;
    const down = reducedMotion ? 0 : 320;
    await Promise.all([
      director.sequence('golemY', [
        { to: 1.9, ms: up, easing: ease.outQuad },
        { to: 0, ms: down, easing: ease.inQuad },
      ]),
      director.to('obstacleX', LEVEL.passX, up + down),
      director.to('scroll', director.get('scroll') + (LEVEL.stopX - LEVEL.passX), up + down),
    ]);
    if (alive.current) setPose('idle');
  }, [director, reducedMotion]);

  const stumble = useCallback(
    async (hurt: boolean) => {
      play('bump');
      haptic.error();
      setPose('hurt');
      if (!reducedMotion) {
        void director.sequence('golemDX', [
          { to: 0.35, ms: 110, easing: ease.outQuad },
          { to: -0.45, ms: 160 },
          { to: 0, ms: 200, easing: ease.outQuad },
        ]);
        // Perdeu um coração: o Golem pisca três vezes.
        if (hurt) void director.sequence('blink', [0, 1, 2, 3, 4, 5].map((i) => ({ to: i % 2 === 0 ? 1 : 0, ms: 90 })));
      }
      await sleep(reducedMotion ? 250 : 620);
      if (alive.current) setPose('idle');
    },
    [director, reducedMotion],
  );

  const reachGoal = useCallback(async () => {
    setShowGoal(true);
    director.set('goalX', LEVEL.spawnX);
    const ms = reducedMotion ? 0 : 1300;
    setPose('walk');
    await Promise.all([
      director.to('goalX', LEVEL.goalX, ms),
      director.to('scroll', director.get('scroll') + (LEVEL.spawnX - LEVEL.goalX), ms),
    ]);
    if (!alive.current) return;
    setPose('cheer');
    play('clear');
    const g = nodeId ? goalOf(nodeId) : null;
    if (g?.captionPt) flashCaption(g.captionPt, 3000);
    await sleep(1500);
  }, [director, flashCaption, nodeId, reducedMotion]);

  // --------------------------------------------------------------- fluxo

  const loadQuestion = useCallback(async () => {
    const q = await api.journey.question(runId);
    if (!alive.current) return;
    setQuestion({ q, offset: clockOffsetMs(q.serverNow, Date.now()) });
    setEliminated(q.eliminated);
    setHint(null);
    setChosen(null);
    setResult(null);
    setVisualIndex(q.obstacleIndex);
    setPhase('question');
  }, [runId]);

  const fail = useCallback((e: unknown) => {
    if (!alive.current) return;
    setError(errorMessage(e));
    setPhase('error');
  }, []);

  const boot = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const r = await api.journey.run(runId);
      if (!alive.current) return;
      setRun(r);
      setVisualIndex(r.obstacleIndex);
      if (r.status === 'completed') {
        setPhase('complete');
        return;
      }
      if (r.status !== 'active') {
        setPhase('failed');
        return;
      }
      if (r.openAnswerId) {
        director.set('obstacleX', LEVEL.stopX);
        await loadQuestion();
        return;
      }
      // Fase 8: textos no idioma do jogador. Se o servidor precisa traduzir, o Golem ensina a jogar enquanto isso.
      const ready = await waitForPrep(() => api.journey.prepare(r.nodeId), {
        isAlive: () => alive.current,
        onProgress: (p) => {
          if (!alive.current) return;
          setPrep(p);
          setPhase('preparing');
        },
      });
      if (!alive.current) return;
      setPrep(ready);
      if (ready.status === 'unavailable') {
        setPhase('unavailable');
        return;
      }
      setPrep(null);
      setPhase('walking');
      await approach(r.obstacleIndex, r.nodeId, r.obstacleCount);
      await loadQuestion();
    } catch (e) {
      fail(e);
    }
  }, [approach, director, fail, loadQuestion, runId]);

  useEffect(() => {
    void boot();
    // Só na entrada da tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const afterResult = useCallback(
    async (res: JourneyAnswerResult) => {
      setResult(res);
      setRun(res.run);
      if (res.passed) {
        await jumpOver();
        if (res.coinsAwarded > 0) {
          play('coin');
          setCoinFx({ key: Date.now(), text: `+${res.coinsAwarded}` });
        }
      } else {
        await stumble(!res.forgiven);
      }
      if (!alive.current) return;
      setPhase('feedback');
      void qc.invalidateQueries({ queryKey: keys.journey });
    },
    [jumpOver, qc, stumble],
  );

  const answer = useCallback(
    async (optionIndex: number | null) => {
      if (phase !== 'question' || !question) return;
      setChosen(optionIndex);
      setPhase('answering');
      try {
        const res = await api.journey.answer(runId, question.q.answerId, optionIndex);
        await afterResult(res);
      } catch (e) {
        // A pergunta pode ter vencido do lado do servidor: recomeça do estado real.
        if (e instanceof ApiError && e.status === 409) void boot();
        else fail(e);
      }
    },
    [afterResult, boot, fail, phase, question, runId],
  );

  const applyPower = useCallback(
    async (kind: JourneyPower) => {
      if (phase !== 'question' || !question) return;
      setBusyPower(true);
      try {
        const r = await api.journey.power(runId, question.q.answerId, kind);
        play('power');
        setRun(r.run);
        // Ajuda da mochila usada: a carteira (e a loja) mostram a mochila nova.
        if (r.source === 'boost') void qc.invalidateQueries({ queryKey: keys.economy });
        // +10 s: o relógio da pergunta ganha o prazo novo.
        const deadlineAt = r.deadlineAt;
        if (deadlineAt) setQuestion((cur) => (cur ? { ...cur, q: { ...cur.q, deadlineAt, timeAdded: true } } : cur));
        if (r.eliminated) setEliminated(r.eliminated);
        if (r.hint) setHint(r.hint);
        if (r.answer) {
          setPhase('answering');
          await afterResult(r.answer);
        }
      } catch (e) {
        setToast(errorMessage(e));
        setTimeout(() => alive.current && setToast(null), 2500);
      } finally {
        if (alive.current) setBusyPower(false);
      }
    },
    [afterResult, phase, qc, question, runId],
  );

  const next = useCallback(async () => {
    const res = result;
    if (!res || !run) return;
    setResult(null);
    setQuestion(null);
    try {
      if (res.completion) {
        setCompletion(res.completion);
        setPhase('goal');
        await reachGoal();
        if (alive.current) setPhase('complete');
        return;
      }
      if (res.run.status === 'failed') {
        play('wrong');
        setPhase('failed');
        return;
      }
      if (res.passed) {
        setPhase('walking');
        await approach(res.run.obstacleIndex, res.run.nodeId, res.run.obstacleCount);
      }
      await loadQuestion();
    } catch (e) {
      fail(e);
    }
  }, [approach, fail, loadQuestion, reachGoal, result, run]);

  const restart = useCallback(async () => {
    if (!run) return;
    setRestarting(true);
    try {
      const fresh = await api.journey.start(run.nodeId);
      void qc.invalidateQueries({ queryKey: keys.journey });
      router.replace(`/journey/run/${fresh.runId}`);
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      if (alive.current) setRestarting(false);
    }
  }, [qc, run]);

  const leave = useCallback(async () => {
    if (phase === 'question' || phase === 'answering') {
      const ok = await confirmAction(t('Sair da fase?'), t('A pergunta aberta vai contar como tempo esgotado. Você pode continuar a fase depois pelo mapa.'), t('Sair'));
      if (!ok) return;
    }
    void qc.invalidateQueries({ queryKey: keys.journey });
    if (router.canGoBack()) router.back();
    else router.replace('/journey');
  }, [phase, qc]);

  const toMap = useCallback(() => {
    void qc.invalidateQueries({ queryKey: keys.journey });
    router.dismissTo('/journey');
  }, [qc]);

  /** Fim de fase é uma pausa: pode ser a hora do anúncio (com o presente antes). */
  const afterBreak = useCallback(
    (go: () => void) => async () => {
      setLeaving(true);
      await adBreak('level');
      if (alive.current) setLeaving(false);
      go();
    },
    [],
  );

  /** Perdeu o último coração: com um anúncio, continua de onde parou com 1 coração. */
  const revive = useCallback(async () => {
    if (!run) return;
    setReviving(true);
    const outcome = await earnReward('continue', run.runId);
    if (!alive.current) return;
    setReviving(false);
    if (outcome === 'claimed') void boot();
  }, [boot, run]);

  // --------------------------------------------------------------- tela

  const locked = phase !== 'question';
  const showCard = question && (phase === 'question' || phase === 'answering');

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.fill}>
      <StatusBar style="light" />
      <View style={[styles.column, { width }]}>
        <View style={styles.hud}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Sair da fase')} onPress={() => void leave()} hitSlop={10} style={styles.back}>
            <Ionicons name="close" size={26} color={px.white} />
          </Pressable>
          {run ? <Hearts value={run.hearts} max={run.maxHearts} size={24} testID="journey-hearts" /> : <View style={styles.flex} />}
          <View style={styles.flex} />
          <NoAdsButton />
          {run ? <Coins value={run.coins} /> : null}
        </View>
        {run ? (
          <View style={styles.progress} accessibilityLabel={t('Obstáculo {n} de {max}', { n: Math.min(run.obstacleIndex + 1, run.obstacleCount), max: run.obstacleCount })}>
            {Array.from({ length: run.obstacleCount }, (_, i) => (
              <View key={i} style={[styles.step, { backgroundColor: i < run.obstacleIndex ? px.gold : i === run.obstacleIndex ? px.white : 'rgba(255,255,255,0.25)' }]} />
            ))}
            <FlagIcon size={20} />
          </View>
        ) : null}
        <View>
          <LevelScene3D
            width={width}
            stage={stage}
            seed={nodeId}
            obstacle={showGoal ? null : (obstacle?.obstacle ?? null)}
            goal={showGoal ? (goal?.model ?? null) : null}
            look={look}
            pose={pose}
            director={director}
            still={reducedMotion}
            caption={caption}
            dark={stage.sky === 'night' || stage.sky === 'void' || stage.sky === 'storm'}
          />
          {coinFx ? <FloatUp key={coinFx.key} text={coinFx.text} color={px.gold} style={{ left: width * 0.2, top: width * 0.18 }} /> : null}
          {info ? (
            <View style={styles.levelTag}>
              <View style={[styles.levelDot, { backgroundColor: info.color }]} />
              <GameText size="xs" weight="semibold" numberOfLines={1}>
                {info.title}
              </GameText>
            </View>
          ) : null}
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.bottom} keyboardShouldPersistTaps="handled">
          {obstacle && obstacle.captionPt && !showGoal && phase !== 'loading' && phase !== 'preparing' ? (
            <View style={styles.event}>
              <View style={styles.eventIcon}>
                <Ionicons name="book" size={16} color={px.ink} />
              </View>
              <T variant="small" color="#DDE3FA" style={styles.flex}>
                {obstacle.captionPt}
                <T variant="caption" color="#9FAAD6">
                  {'  '}
                  {shortRef(obstacle.ref, currentLocale())}
                </T>
              </T>
            </View>
          ) : null}
          {phase === 'loading' || (phase === 'walking' && !question) ? (
            <GameText size="sm" color="#9FAAD6" align="center" style={styles.wait}>
              {phase === 'loading' ? t('Carregando a fase…') : t('O Golem segue em frente…')}
            </GameText>
          ) : null}
          {showCard ? (
            <QuestionCard
              question={question.q}
              offsetMs={question.offset}
              run={run!}
              locked={locked}
              chosen={chosen}
              eliminated={eliminated}
              result={null}
              hint={hint}
              busyPower={busyPower}
              onAnswer={(i) => void answer(i)}
              onPower={(k) => void applyPower(k)}
            />
          ) : null}
          {phase === 'feedback' && result && question ? <FeedbackPanel result={result} question={question.q} onContinue={() => void next()} /> : null}
          {phase === 'error' ? (
            <GamePanel style={styles.errorBox}>
              <T color={px.white}>{error}</T>
              <GameButton label={t('Tentar de novo')} tone="gold" onPress={() => void boot()} />
              <GameButton label={t('Voltar ao mapa')} tone="blue" size="sm" onPress={toMap} />
            </GamePanel>
          ) : null}
        </ScrollView>

        {toast ? (
          <Animated.View style={styles.toast}>
            <T variant="small" color={px.white} align="center">
              {toast}
            </T>
          </Animated.View>
        ) : null}
      </View>

      {phase === 'complete' && run ? (
        <CompletionOverlay
          runId={run.runId}
          nodeId={run.nodeId}
          completion={completion}
          coins={run.coins}
          look={look}
          canDouble={!!ads && run.coins > 0}
          onMap={() => void afterBreak(toMap)()}
          onReplay={() => void afterBreak(() => void restart())()}
          onTracks={
            info?.kind === 'main' && info.parashaId && (completion?.opened.length ?? 0) > 0
              ? () => void afterBreak(() => router.replace(`/journey/parasha/${info.parashaId}`))()
              : null
          }
          busy={restarting || leaving}
        />
      ) : null}
      {phase === 'failed' ? (
        <FailedOverlay
          look={look}
          onRetry={() => void afterBreak(() => void restart())()}
          onMap={() => void afterBreak(toMap)()}
          onContinue={ads && run && !run.revived ? () => void revive() : null}
          continuing={reviving}
          busy={restarting || leaving}
        />
      ) : null}
      {phase === 'preparing' || phase === 'unavailable' ? <PrepOverlay mode="journey" status={prep} look={look} onBack={toMap} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: px.velvetDeep },
  flex: { flex: 1 },
  column: { flex: 1, alignSelf: 'center' },
  hud: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 6 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingBottom: 8 },
  step: { flex: 1, height: 8, borderRadius: 4 },
  levelTag: {
    position: 'absolute',
    bottom: 6,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(19,28,85,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    maxWidth: '70%',
  },
  levelDot: { width: 9, height: 9, borderRadius: 5 },
  bottom: { padding: 12, gap: 12, paddingBottom: 32 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: px.gold, alignItems: 'center', justifyContent: 'center' },
  wait: { marginTop: 24 },
  errorBox: { gap: 12 },
  toast: { position: 'absolute', bottom: 24, left: 24, right: 24, backgroundColor: 'rgba(19,28,85,0.94)', borderRadius: 16, padding: 12 },
});
