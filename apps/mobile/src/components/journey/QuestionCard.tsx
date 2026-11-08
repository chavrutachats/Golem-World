/**
 * A pergunta dentro de uma fase do Golem World: cartão de pergaminho com o
 * cronômetro em barra, o trecho de estudo (quando há), as alternativas א ב ג ד, os
 * poderes dos itens e, depois da resposta, o painel do resultado com a fonte no Sefaria.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { DIFFICULTY_LABELS_PT, shortRef, type JourneyAnswerResult, type JourneyQuestion, type JourneyPower, type JourneyRun, type PowerUpResult } from '@trivia/shared';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { CoinIcon } from '@/components/game/icons';
import { ItemIcon } from '@/components/game/ItemIcon';
import { GameButton, GamePanel } from '@/components/game/GameUI';
import { GameText } from '@/components/game/GameText';
import { Chunky } from '@/components/ui/Chunky';
import { T } from '@/components/ui/Text';
import { displaySeconds, isUrgent, remainingMs } from '@/lib/countdown';
import { haptic } from '@/lib/feedback';
import { OUTCOME_COPY } from '@/lib/journey-level';
import { isSefariaUrl } from '@/lib/links';
import { STAGGER_MS } from '@/lib/motion';
import { play } from '@/lib/sound';
import { g as px } from '@/theme/game';
import { currentLocale, isRtl, msg, t, tc, tn } from '@/lib/i18n';

const LETTERS = ['א', 'ב', 'ג', 'ד'] as const;
/** Cronômetro em barra, com os segundos ao lado; nos últimos 5 segundos fica vermelho e toca o relógio. */
export function GameTimer({
  deadlineAt,
  offsetMs,
  totalMs,
  stopped,
  onExpire,
}: {
  deadlineAt: string;
  offsetMs: number;
  totalMs: number;
  stopped: boolean;
  onExpire: () => void;
}) {
  const [ms, setMs] = useState(() => remainingMs(deadlineAt, Date.now(), offsetMs));
  const fired = useRef(false);
  const lastSecond = useRef<number | null>(null);
  useEffect(() => {
    fired.current = false;
    lastSecond.current = null;
  }, [deadlineAt]);
  useEffect(() => {
    if (stopped) return;
    const timer = setInterval(() => {
      const left = remainingMs(deadlineAt, Date.now(), offsetMs);
      setMs(left);
      const sec = displaySeconds(left);
      if (isUrgent(left) && sec !== lastSecond.current) {
        lastSecond.current = sec;
        play('clock', 0.6);
        haptic.select();
      }
      if (left <= 0 && !fired.current) {
        fired.current = true;
        onExpire();
      }
    }, 100);
    return () => clearInterval(timer);
  }, [deadlineAt, offsetMs, stopped, onExpire]);
  const fraction = totalMs > 0 ? Math.max(0, Math.min(1, ms / totalMs)) : 0;
  const urgent = isUrgent(ms);
  return (
    <View style={styles.timer} accessibilityRole="progressbar" accessibilityLabel={t('Tempo restante')} accessibilityValue={{ text: tn(displaySeconds(ms), '{n} segundo', '{n} segundos') }}>
      <Ionicons name="time" size={18} color={urgent ? px.red : px.greyDeep} />
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: urgent ? px.red : fraction < 0.5 ? px.gold : px.green }]} />
      </View>
      <GameText size="md" weight="bold" color={urgent ? px.red : px.ink} style={styles.seconds}>
        {displaySeconds(ms)}
      </GameText>
    </View>
  );
}

type OptionLook = 'idle' | 'chosen' | 'correct' | 'wrong' | 'dim' | 'eliminated';

function JourneyOption({
  index,
  text,
  rtl,
  look,
  disabled,
  onPress,
}: {
  index: number;
  text: string;
  rtl: boolean;
  look: OptionLook;
  disabled: boolean;
  onPress: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const face = look === 'correct' ? px.green : look === 'wrong' ? px.red : look === 'chosen' ? px.gold : look === 'eliminated' ? '#E2D7BE' : '#FFFBF2';
  const lip = look === 'correct' ? px.greenDeep : look === 'wrong' ? px.redDeep : look === 'chosen' ? px.goldDeep : px.paperDeep;
  const ink = look === 'wrong' ? px.white : look === 'eliminated' ? '#8C8576' : px.ink;
  return (
    <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(index * STAGGER_MS).duration(220)} style={look === 'dim' ? styles.dim : null}>
      <Chunky
        accessibilityRole="button"
        accessibilityLabel={`${t('Alternativa {n}: {text}', { n: index + 1, text })}${look === 'eliminated' ? ` ${t('(eliminada)')}` : ''}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        face={face}
        lip={lip}
        border={look === 'idle' || look === 'eliminated' ? px.paperDeep : face}
        borderWidth={1}
        radius={16}
        lipHeight={3}
        sound="tick"
        faceStyle={[styles.option, rtl && !isRtl() && styles.rowRtl]}
        testID={`journey-option-${index}`}
      >
        <View style={[styles.letter, { backgroundColor: look === 'idle' || look === 'eliminated' ? px.velvet : 'rgba(0,0,0,0.25)' }]}>
          <T serif weight="bold" variant="body" color={px.white}>
            {LETTERS[index]}
          </T>
        </View>
        <T
          variant="body"
          weight="medium"
          serif={rtl}
          color={ink}
          style={[styles.optionText, rtl && styles.rtl, look === 'eliminated' && styles.strike]}
        >
          {text}
        </T>
      </Chunky>
    </Animated.View>
  );
}

const POWER_SPRITES: Record<JourneyPower, { icon: 'eye-off' | 'play-skip-forward' | 'bulb' | 'time'; label: string }> = {
  eliminate: { icon: 'eye-off', label: msg('Eliminar 2') },
  skip: { icon: 'play-skip-forward', label: msg('Pular') },
  hint: { icon: 'bulb', label: msg('Dica') },
  time: { icon: 'time', label: msg('+10 s') },
};

/**
 * Quantos usos de cada poder nesta pergunta: a cota dos itens vestidos mais as ajudas
 * da mochila (Fase 9). A dica é só da chavruta; o tempo extra só da mochila e uma vez
 * por pergunta.
 */
function powerCount(kind: JourneyPower, run: JourneyRun, question: JourneyQuestion): number {
  switch (kind) {
    case 'hint':
      return run.powerUps.hint;
    case 'time':
      return question.timeAdded ? 0 : run.boosts.time;
    default:
      return run.powerUps[kind] + run.boosts[kind];
  }
}

export interface QuestionCardProps {
  question: JourneyQuestion;
  offsetMs: number;
  run: JourneyRun;
  /** Respondendo ou mostrando resultado: trava as alternativas e o relógio. */
  locked: boolean;
  chosen: number | null;
  eliminated: number[];
  result: JourneyAnswerResult | null;
  hint: PowerUpResult['hint'] | null;
  busyPower: boolean;
  onAnswer: (index: number | null) => void;
  onPower: (kind: JourneyPower) => void;
}

export function QuestionCard({ question, offsetMs, run, locked, chosen, eliminated, result, hint, busyPower, onAnswer, onPower }: QuestionCardProps) {
  const rtl = question.optionsDirection === 'rtl';
  const contextRtl = question.context?.language === 'he';
  const lookOf = (i: number): OptionLook => {
    if (result) {
      if (i === result.correctOptionIndex) return 'correct';
      if (i === chosen) return 'wrong';
      return eliminated.includes(i) ? 'eliminated' : 'dim';
    }
    if (eliminated.includes(i)) return 'eliminated';
    if (chosen === i) return 'chosen';
    return 'idle';
  };
  const powers = (['time', 'eliminate', 'hint', 'skip'] as const).filter((k) => powerCount(k, run, question) > 0);

  return (
    <GamePanel tone="paper" style={styles.card} testID="journey-question">
      <GameTimer
        deadlineAt={question.deadlineAt}
        offsetMs={offsetMs}
        totalMs={new Date(question.deadlineAt).getTime() - new Date(question.servedAt).getTime()}
        stopped={locked}
        onExpire={() => onAnswer(null)}
      />
      <View style={styles.tagRow}>
        <View style={styles.tag}>
          <GameText size="xs" weight="semibold" color={px.white}>
            {tc(DIFFICULTY_LABELS_PT[question.difficulty])}
          </GameText>
        </View>
      </View>
      {question.context ? (
        <View style={styles.context}>
          <T variant="caption" weight="bold" color={px.greyDeep}>
            {question.context.label}
          </T>
          <T variant="body" serif={contextRtl} color={px.ink} style={contextRtl ? styles.rtl : null}>
            {question.context.text}
          </T>
        </View>
      ) : null}
      <T variant="lead" weight="bold" color={px.ink} accessibilityRole="header" style={isRtl() ? styles.rtl : null}>
        {question.text}
      </T>
      {hint ? (
        <Animated.View entering={FadeIn.duration(250)} style={styles.hint}>
          <ItemIcon id="chavruta" size={32} />
          <View style={styles.flex}>
            <T variant="small" weight="bold" color={px.ink}>
              {t('Sua chavruta sugere olhar em {ref}', { ref: shortRef(hint.ref, currentLocale()) })}
            </T>
            <T variant="small" color={px.ink} numberOfLines={5}>
              {hint.text}
            </T>
          </View>
        </Animated.View>
      ) : null}
      <View style={styles.options}>
        {question.options.map((text, i) => (
          <JourneyOption
            key={`${question.answerId}-${i}`}
            index={i}
            text={text}
            rtl={rtl}
            look={lookOf(i)}
            disabled={locked || eliminated.includes(i)}
            onPress={() => onAnswer(i)}
          />
        ))}
      </View>
      {powers.length > 0 && !result ? (
        <View style={styles.powers}>
          {powers.map((k) => (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityLabel={`${t(POWER_SPRITES[k].label)} (${tn(powerCount(k, run, question), '{n} restante', '{n} restantes')})`}
              disabled={locked || busyPower || (k === 'hint' && !!hint)}
              onPress={() => onPower(k)}
              style={({ pressed }) => [styles.power, (locked || busyPower || (k === 'hint' && !!hint)) && styles.dim, pressed && styles.pressed]}
              testID={`journey-power-${k}`}
            >
              <Ionicons name={POWER_SPRITES[k].icon} size={18} color={px.velvet} />
              <GameText size="sm" color={px.ink}>
                {t(POWER_SPRITES[k].label)} ×{powerCount(k, run, question)}
              </GameText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </GamePanel>
  );
}

/** Painel do resultado, com a explicação e a fonte: aprender é o objetivo da jornada. */
export function FeedbackPanel({ result, question, onContinue }: { result: JourneyAnswerResult; question: JourneyQuestion; onContinue: () => void }) {
  const copy = OUTCOME_COPY[result.outcome];
  const good = copy.good || result.forgiven;
  const quoteRtl = result.source.language === 'he';
  // A explicação às vezes já traz o trecho inteiro: não repetir.
  const quote = result.source.quote && !result.explanation.includes(result.source.quote.slice(0, 40)) ? result.source.quote : null;
  return (
    <Animated.View entering={SlideInDown.springify().damping(18)} testID="journey-feedback">
      <GamePanel style={[styles.feedback, good ? styles.good : styles.bad]}>
        <View style={styles.feedbackHead}>
          <GameText size="lg" shadow style={styles.flex} accessibilityRole="header">
            {result.forgiven ? t('A pena do sofer apagou o erro') : t(copy.title)}
          </GameText>
          {result.coinsAwarded > 0 ? (
            <View style={styles.coinTag}>
              <CoinIcon size={22} />
              <GameText size="md" weight="bold">+{result.coinsAwarded}</GameText>
            </View>
          ) : null}
        </View>
        {!result.correct ? (
          <T variant="body" color={px.white}>
            <T variant="body" weight="bold" color={px.gold}>
              {t('Resposta:')}{' '}
            </T>
            {question.options[result.correctOptionIndex]}
          </T>
        ) : null}
        {result.forgiven ? (
          <T variant="small" color="#E8F5EC">
            {t('Nenhum coração perdido desta vez.')}
          </T>
        ) : null}
        {result.explanation ? (
          <T variant="small" color="#EEF1FA" style={isRtl() ? styles.rtl : null}>
            {result.explanation}
          </T>
        ) : null}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('Abrir {ref} no Sefaria', { ref: result.source.ref })}
          onPress={() => {
            if (isSefariaUrl(result.source.url)) void WebBrowser.openBrowserAsync(result.source.url);
          }}
          style={styles.source}
        >
          <T variant="caption" weight="bold" color={px.gold}>
            {shortRef(result.source.ref, currentLocale())}
          </T>
          {quote ? (
            <T variant="small" serif={quoteRtl} color={px.white} numberOfLines={4} style={quoteRtl ? styles.rtl : null}>
              {quote}
            </T>
          ) : null}
          {result.source.machineTranslated ? (
            <T variant="caption" color="#C9D3F5">
              {t('Tradução automática do original.')}
            </T>
          ) : null}
          <View style={styles.linkRow}>
            <T variant="caption" color="#C9D3F5">
              {t('Ler no Sefaria')}
            </T>
            <Ionicons name="open-outline" size={13} color="#C9D3F5" />
          </View>
        </Pressable>
        <GameButton label={t('Continuar')} tone={good ? 'green' : 'gold'} onPress={onContinue} sound="pop" testID="journey-continue" />
      </GamePanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: 12, padding: 14 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#E4D6B5', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
  seconds: { minWidth: 26, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tagRow: { flexDirection: 'row' },
  tag: { backgroundColor: px.velvet, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10 },
  context: { backgroundColor: 'rgba(42,33,23,0.05)', borderStartWidth: 3, borderStartColor: px.goldDeep, padding: 12, gap: 4, borderRadius: 10 },
  hint: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#E8F0FF', padding: 10, borderRadius: 14 },
  options: { gap: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, minHeight: 52 },
  rowRtl: { flexDirection: 'row-reverse' },
  letter: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1 },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
  strike: { textDecorationLine: 'line-through' },
  dim: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  powers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  power: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: px.white,
    borderWidth: 1.5,
    borderColor: px.paperDeep,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  feedback: { gap: 10, padding: 16 },
  good: { backgroundColor: '#1D6B4E', borderColor: '#3DBB86' },
  bad: { backgroundColor: '#6E2233', borderColor: '#B8324A' },
  feedbackHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coinTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  source: { gap: 4, backgroundColor: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 14 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
