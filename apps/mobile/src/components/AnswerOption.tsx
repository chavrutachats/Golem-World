/**
 * Alternativa da pergunta como peça de jogo sobre a noite de tekhelet: letra hebraica
 * (א ב ג ד) num aro dourado fino, face que afunda ao toque e reação ao resultado — a
 * escolhida ganha o contorno de tekhelet, a certa pula e fica esmeralda, a errada treme
 * e fica rubi, as outras se apagam.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { springs, STAGGER_MS } from '@/lib/motion';
import { brand, fonts, radius, space } from '@/theme/tokens';
import { Confetti } from './fx/Confetti';
import { FloatUp } from './fx/FloatUp';
import { Chunky } from './ui/Chunky';
import { T } from './ui/Text';
import { t } from '@/lib/i18n';

export type AnswerState = 'idle' | 'chosen' | 'correct' | 'wrong' | 'dimmed';

const LETTERS = ['א', 'ב', 'ג', 'ד'] as const;

const EMERALD = { face: '#1D7A57', lip: '#114D37', line: '#3DBB86' };
const RUBY = { face: '#9E2F45', lip: '#641C2B', line: '#EF5B6E' };

const LOOK: Record<AnswerState, { face: string; lip: string; border: string; fg: string }> = {
  idle: { face: brand.velvet, lip: '#0C1130', border: brand.velvetLine, fg: brand.onVelvet },
  chosen: { face: brand.velvetRaised, lip: '#0C1130', border: brand.tekhelet, fg: brand.onVelvet },
  correct: { face: EMERALD.face, lip: EMERALD.lip, border: EMERALD.line, fg: '#FFFFFF' },
  wrong: { face: RUBY.face, lip: RUBY.lip, border: RUBY.line, fg: '#FFFFFF' },
  dimmed: { face: brand.velvet, lip: '#0C1130', border: brand.velvetLine, fg: brand.onVelvetMuted },
};

export const CONFETTI_COLORS = [brand.gold, '#FFFFFF', EMERALD.line, brand.tekhelet, '#F7D98A'] as const;

export function AnswerOption({
  label,
  index,
  state,
  disabled,
  onPress,
  points,
  celebrate,
}: {
  label: string;
  index: number;
  state: AnswerState;
  disabled: boolean;
  onPress: () => void;
  /** Pontos ganhos, mostrados subindo da alternativa certa escolhida. */
  points?: number;
  /** Explode confete desta peça (acerto). */
  celebrate?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const look = LOOK[state];
  const scale = useSharedValue(1);
  const shake = useSharedValue(0);
  const glow = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    if (state === 'correct') {
      scale.value = reducedMotion ? 1 : withSequence(withSpring(1.06, springs.pop), withSpring(1, springs.pop));
    }
    if (state === 'wrong' && !reducedMotion) {
      shake.value = withSequence(
        withTiming(-12, { duration: 45 }),
        withTiming(11, { duration: 70 }),
        withTiming(-8, { duration: 65 }),
        withTiming(6, { duration: 60 }),
        withTiming(-3, { duration: 55 }),
        withTiming(0, { duration: 50 }),
      );
    }
    glow.value = state === 'chosen' && !reducedMotion ? withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0.35, { duration: 380 })), -1) : withTiming(0);
    fade.value = withTiming(state === 'dimmed' ? 0.42 : 1, { duration: 260 });
  }, [state, reducedMotion, scale, shake, glow, fade]);

  const wrap = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ translateX: shake.value }, { scale: scale.value }] }));
  const ring = useAnimatedStyle(() => ({ opacity: glow.value }));

  const status = state === 'correct' ? t('resposta certa') : state === 'wrong' ? t('sua resposta, errada') : null;
  const marked = state === 'correct' || state === 'wrong';

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeInDown.delay(180 + index * STAGGER_MS).springify().damping(15)}
      style={[state === 'correct' && styles.onTop]}
    >
      <Animated.View style={wrap}>
        <Chunky
          accessibilityRole="button"
          accessibilityLabel={status ? `${label}, ${status}` : label}
          accessibilityState={{ disabled, selected: state === 'chosen' }}
          disabled={disabled}
          onPress={onPress}
          sound="pop"
          face={look.face}
          lip={look.lip}
          border={look.border}
          borderWidth={1}
          radius={radius.surface}
          faceStyle={styles.face}
        >
          <View style={[styles.badge, marked ? styles.badgeMarked : { borderColor: state === 'chosen' ? brand.tekhelet : brand.goldDeep }]}>
            {state === 'correct' ? (
              <Ionicons name="checkmark" size={22} color={EMERALD.face} />
            ) : state === 'wrong' ? (
              <Ionicons name="close" size={22} color={RUBY.face} />
            ) : (
              <T style={styles.letter} color={state === 'chosen' ? brand.tekhelet : brand.gold}>
                {LETTERS[index]}
              </T>
            )}
          </View>
          <T variant="lead" weight="medium" color={look.fg} style={styles.label}>
            {label}
          </T>
        </Chunky>
        <Animated.View pointerEvents="none" style={[styles.ring, ring]} />
      </Animated.View>
      {celebrate ? <Confetti burst={1} colors={CONFETTI_COLORS} style={styles.burst} /> : null}
      {points ? <FloatUp text={`+${points}`} style={styles.points} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  onTop: { zIndex: 10 },
  face: {
    minHeight: 62,
    paddingVertical: space.sm + 2,
    paddingLeft: space.sm + 2,
    paddingRight: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  badge: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  badgeMarked: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  letter: { fontFamily: fonts.serifBold, fontSize: 22, lineHeight: 28 },
  label: { flex: 1 },
  ring: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: 1,
    borderRadius: radius.surface + 4,
    borderWidth: 2,
    borderColor: brand.tekhelet,
  },
  burst: { top: 28, left: '50%' },
  points: { right: space.lg, top: -6 },
});
