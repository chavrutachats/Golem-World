/**
 * Tela do quiz, sobre o veludo como o tabuleiro: faixa da categoria com o cronômetro,
 * a pergunta num cartão de papel e as alternativas como peças de jogo. Depois da
 * resposta, a peça certa pula (com confete e pontos), a errada treme, e um painel sobe
 * com o gabarito, a explicação e a fonte no Sefaria.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CATEGORIES, DIFFICULTY_LABELS_PT, GAME_RULES, type AnswerResult, type GameState } from '@trivia/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeIn, SlideInDown, useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AnswerOption, CONFETTI_COLORS, type AnswerState } from '@/components/AnswerOption';
import { CountdownRing } from '@/components/CountdownRing';
import { NoAdsButton } from '@/components/economy/NoAdsFab';
import { Confetti } from '@/components/fx/Confetti';
import { CategoryMark, CrownMeter, SealStamp } from '@/components/GamePieces';
import { Keter } from '@/components/Keter';
import { ReportSheet } from '@/components/ReportSheet';
import { SourceCard } from '@/components/SourceCard';
import { Button } from '@/components/ui/Button';
import { CONTENT_MAX_WIDTH } from '@/components/ui/Screen';
import { T } from '@/components/ui/Text';
import { ApiError } from '@/lib/api-core';
import { pointsLabel } from '@/lib/copy';
import { clockOffsetMs } from '@/lib/countdown';
import { haptic } from '@/lib/feedback';
import { springs } from '@/lib/motion';
import { play } from '@/lib/sound';
import { errorMessage, keys, type CachedQuestion } from '@/lib/queries';
import { api, updateUser, useSession } from '@/lib/session';
import { useTheme } from '@/theme/theme';
import { brand, radius, space } from '@/theme/tokens';
import { isRtl, t, tc } from '@/lib/i18n';

const TOTAL_MS = GAME_RULES.questionTimeLimitSeconds * 1000;

function continueLabel(r: AnswerResult): string {
  if (r.gameFinished) return t('Ver o resultado');
  if (r.crownReady) return t('Escolher o selo');
  if (r.canSpinAgain) return t('Girar de novo');
  return t('Continuar');
}

function headline(r: AnswerResult): string {
  if (r.correct) return r.sealEarned ? t('Selo conquistado!') : t('Acertou!');
  return r.timedOut ? t('O tempo acabou') : t('Não foi dessa vez');
}

export default function QuestionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const scroll = useRef<ScrollViewInstance>(null);
  const [resultY, setResultY] = useState(0);

  const query = useQuery({
    queryKey: keys.question(id),
    queryFn: async (): Promise<CachedQuestion> => ({ question: await api.games.currentQuestion(id), receivedAt: Date.now() }),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  const [chosen, setChosen] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const submitted = useRef(false);

  const game = qc.getQueryData<GameState>(keys.game(id));
  const opponentName = game && game.mode !== 'solo' ? (game.opponent?.displayName ?? null) : null;
  const cached = query.data;
  const q = cached?.question;
  const offset = useMemo(() => (cached ? clockOffsetMs(cached.question.serverNow, cached.receivedAt) : 0), [cached]);

  const submit = useCallback(
    async (index: number | null) => {
      if (!q || submitted.current) return;
      submitted.current = true;
      setChosen(index);
      setSending(true);
      if (index !== null) haptic.tap();
      try {
        const r = await api.games.answer(id, q.playId, index);
        setResult(r);
        if (r.sealEarned) {
          play('seal');
          haptic.heavy();
        } else if (r.correct) {
          play('correct');
          haptic.success();
        } else {
          play('wrong');
          haptic.error();
        }
        if (user && r.pointsAwarded) updateUser({ totalPoints: user.totalPoints + r.pointsAwarded });
        void qc.invalidateQueries({ queryKey: keys.game(id) });
        void qc.invalidateQueries({ queryKey: keys.games });
        void qc.invalidateQueries({ queryKey: keys.me });
      } catch (e) {
        setError(
          e instanceof ApiError && e.code === 'ALREADY_ANSWERED'
            ? t('O tempo desta pergunta acabou enquanto o app estava fechado.')
            : errorMessage(e),
        );
      } finally {
        setSending(false);
      }
    },
    [q, id, qc, user],
  );

  const onExpire = useCallback(() => void submit(null), [submit]);

  function leave() {
    qc.removeQueries({ queryKey: keys.question(id) });
    void qc.invalidateQueries({ queryKey: keys.game(id) });
    if (router.canGoBack()) router.back();
    else router.replace(`/game/${id}`);
  }

  if (!q) {
    return (
      <SafeAreaView style={[styles.fill, styles.center, { backgroundColor: brand.velvetDeep }]}>
        {query.error ? (
          <View style={styles.centerBox}>
            <T align="center" color={brand.onVelvet}>
              {errorMessage(query.error)}
            </T>
            <Button label={t('Voltar à partida')} variant="gold" onPress={leave} />
          </View>
        ) : (
          <ActivityIndicator size="large" color={brand.gold} />
        )}
      </SafeAreaView>
    );
  }

  const cat = CATEGORIES[q.category];
  const answered = !!result;

  function stateOf(i: number): AnswerState {
    if (!result) return chosen === i ? 'chosen' : 'idle';
    if (i === result.correctOptionIndex) return 'correct';
    if (i === chosen) return 'wrong';
    return 'dimmed';
  }

  const chosenCorrect = !!result && result.correct && chosen === result.correctOptionIndex;

  return (
    <View style={[styles.fill, { backgroundColor: brand.velvetDeep }]}>
      <StatusBar style={cat.onColor === '#FFFFFF' ? 'light' : 'dark'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: cat.color }}>
        <View style={styles.band}>
          <Animated.View entering={reducedMotion ? undefined : ZoomIn.springify().damping(springs.pop.damping)}>
            <CategoryMark id={q.category} size={52} />
          </Animated.View>
          <View style={styles.flex}>
            <T variant="lead" weight="bold" color={cat.onColor}>
              {tc(cat.labelPt)}
            </T>
            <T variant="small" color={cat.onColor} style={styles.bandSub}>
              {q.isCrownChallenge ? t('Disputa do selo') : t('Nível {level}', { level: tc(DIFFICULTY_LABELS_PT[q.difficulty]).toLowerCase() })}
            </T>
          </View>
          {q.isCrownChallenge ? <Keter size={34} /> : null}
          <NoAdsButton tint={cat.onColor} />
          {!answered && !error ? (
            <CountdownRing
              deadlineAt={q.deadlineAt}
              offsetMs={offset}
              totalMs={TOTAL_MS}
              stopped={sending || !!error}
              onExpire={onExpire}
            />
          ) : null}
        </View>
      </SafeAreaView>

      <ScrollView ref={scroll} contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <Animated.View
            entering={reducedMotion ? undefined : ZoomIn.springify().damping(14).delay(60)}
            style={styles.card}
          >
            {/* Fita da categoria, como o marcador de um sefer. */}
            <View style={[styles.ribbon, { backgroundColor: cat.color }]} />
            {/* O trecho que a pergunta pede para reconhecer (versículo, mishná, halachá…), no original ou na tradução. */}
            {q.context ? (
              <View style={[styles.context, { borderStartColor: cat.color }]} testID="question-context">
                <T variant="caption" weight="semibold" color={KLAF_MUTED}>
                  {q.context.label}
                </T>
                <T
                  serif
                  variant={q.context.language === 'he' ? 'lead' : 'body'}
                  color={brand.klafInk}
                  lang={q.context.language}
                  style={q.context.language === 'he' ? styles.hebrew : styles.ltr}
                >
                  {q.context.language === 'he' ? q.context.text : `“${q.context.text}”`}
                </T>
              </View>
            ) : null}
            <T serif variant="title" color={brand.klafInk} accessibilityRole="header" style={isRtl() ? styles.rtl : null}>
              {q.text}
            </T>
          </Animated.View>

          <View style={styles.options}>
            {q.options.map((option, i) => (
              <AnswerOption
                key={i}
                index={i}
                label={option}
                state={stateOf(i)}
                disabled={sending || answered || !!error}
                onPress={() => void submit(i)}
                celebrate={chosenCorrect && i === result?.correctOptionIndex}
                {...(chosenCorrect && i === result?.correctOptionIndex && result.pointsAwarded ? { points: result.pointsAwarded } : {})}
              />
            ))}
          </View>

          {error ? (
            <View style={styles.centerBox}>
              <T color="#FFB4AB" align="center">
                {error}
              </T>
              <Button label={t('Voltar à partida')} variant="gold" onPress={leave} />
            </View>
          ) : null}

          {result ? (
            <Animated.View
              entering={reducedMotion ? FadeIn.duration(200) : SlideInDown.springify().damping(springs.panel.damping).delay(350)}
              style={[
                styles.result,
                { backgroundColor: brand.velvet, borderColor: brand.velvetLine, borderTopColor: 'rgba(255,255,255,0.14)' },
              ]}
              onLayout={(e) => {
                const y = e.nativeEvent.layout.y;
                if (y !== resultY) {
                  setResultY(y);
                  // Rola até o resultado, deixando à vista as últimas alternativas (com a marcada).
                  setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, y - 220), animated: true }), 400);
                }
              }}
            >
              <View style={styles.resultHead} accessibilityLiveRegion="polite">
                {result.sealEarned ? <SealStamp id={result.sealEarned} size={72} /> : null}
                <View style={styles.flex}>
                  <Animated.View entering={reducedMotion ? undefined : ZoomIn.springify().damping(10).delay(450)}>
                    <T variant="display" weight="bold" color={result.correct ? colors.success : colors.ink}>
                      {headline(result)}
                    </T>
                  </Animated.View>
                  <T muted>
                    {result.sealEarned
                      ? t('O selo de {category} é seu. +{points}.', { category: tc(CATEGORIES[result.sealEarned].labelPt), points: pointsLabel(result.pointsAwarded) })
                      : result.correct
                        ? `+${pointsLabel(result.pointsAwarded)}`
                        : result.turnPassed && opponentName
                          ? t('A resposta certa está em verde. Agora é a vez de {name}.', { name: opponentName })
                          : t('A resposta certa está marcada em verde.')}
                  </T>
                  {!result.correct ? (
                    <View style={styles.lifeLost} accessibilityLabel={t('Você perdeu uma vida. Restam {n}.', { n: result.lives.lives })}>
                      <Ionicons name="heart-dislike" size={16} color={colors.danger} />
                      <T variant="small" color={colors.danger}>
                        {t('−1 vida · restam {n} de {max}', { n: result.lives.lives, max: result.lives.max })}
                      </T>
                    </View>
                  ) : null}
                </View>
              </View>

              {result.correct && !result.sealEarned && !q.isCrownChallenge ? (
                <View style={[styles.crownLine, { backgroundColor: brand.velvetDeep }]}>
                  <T variant="small" weight="bold" color={brand.onVelvet} style={styles.flex}>
                    {result.crownReady ? t('Coroa cheia! Escolha um selo.') : t('Rumo à Coroa')}
                  </T>
                  <CrownMeter progress={result.crownProgress} size={22} />
                </View>
              ) : null}

              <T variant="body" style={isRtl() ? styles.rtl : null}>
                {result.explanation}
              </T>
              <SourceCard source={result.source} accent={cat.color} />

              <Button label={continueLabel(result)} size="lg" variant="gold" sound="pop" onPress={leave} />
              <Pressable accessibilityRole="button" onPress={() => setReporting(true)} style={styles.report} hitSlop={8}>
                <T variant="small" muted>
                  {t('Encontrou um problema nesta pergunta? Denunciar')}
                </T>
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      </ScrollView>

      {result?.sealEarned ? (
        <Confetti burst={1} colors={[CATEGORIES[result.sealEarned].color, ...CONFETTI_COLORS]} count={44} power={1.5} durationMs={1700} style={styles.bigBurst} />
      ) : null}

      <ReportSheet playId={q.playId} visible={reporting} onClose={() => setReporting(false)} />
    </View>
  );
}

/** Tinta clara sobre o klaf (rótulos do trecho citado). */
const KLAF_MUTED = '#6E5E45';

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerBox: { gap: space.md, alignItems: 'stretch', padding: space.lg },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  bandSub: { opacity: 0.9 },
  scroll: { flexGrow: 1, paddingBottom: space.xxxl },
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.lg },
  context: { backgroundColor: 'rgba(42,33,23,0.05)', borderStartWidth: 3, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, gap: 4, marginBottom: space.md },
  hebrew: { writingDirection: 'rtl', textAlign: 'right' },
  ltr: { writingDirection: 'ltr' },
  /** O klaf: só o texto da fonte vai em pergaminho. */
  card: {
    backgroundColor: brand.klaf,
    borderRadius: radius.surface,
    borderWidth: 1,
    borderColor: brand.klafEdge,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.xl,
    overflow: 'hidden',
  },
  ribbon: { position: 'absolute', top: 0, start: space.xl, width: 22, height: 8, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  options: { gap: space.sm + 4 },
  result: { gap: space.lg, marginTop: space.sm, padding: space.lg, borderRadius: radius.piece, borderWidth: 1 },
  lifeLost: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  crownLine: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm + 2, borderRadius: radius.control },
  report: { alignSelf: 'center', paddingVertical: space.sm },
  bigBurst: { top: 140, left: '50%' },
});
