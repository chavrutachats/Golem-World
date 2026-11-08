/**
 * Peças do placar: selos conquistados, medidor da Coroa e a marca de cada categoria.
 */
import { CATEGORIES, CATEGORY_IDS, GAME_RULES, type CategoryId } from '@trivia/shared';
import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { springs } from '@/lib/motion';
import { brand, radius, space } from '@/theme/tokens';
import { Keter } from './Keter';
import { T } from './ui/Text';
import { t, tc } from '@/lib/i18n';

/**
 * Peça que "estoura" quando passa de vazia a cheia (coroa ganha, selo novo).
 * Na primeira renderização não anima: só mudanças vistas pelo jogador.
 */
function PopOnFill({ filled, delayMs = 0, children }: { filled: boolean; delayMs?: number; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const was = useRef(filled);
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  useEffect(() => {
    if (filled && !was.current && !reducedMotion) {
      scale.value = withDelay(delayMs, withSequence(withTiming(0.2, { duration: 1 }), withSpring(1.35, springs.pop), withSpring(1, springs.pop)));
      rotate.value = withDelay(
        delayMs,
        withSequence(withTiming(-14, { duration: 120 }), withTiming(10, { duration: 120 }), withSpring(0, springs.pop)),
      );
    }
    was.current = filled;
  }, [filled, delayMs, reducedMotion, scale, rotate]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Os 6 selos, sempre na mesma ordem; os conquistados aparecem cheios. */
export function SealRow({ seals, size = 22, onVelvet = true }: { seals: readonly CategoryId[]; size?: number; onVelvet?: boolean }) {
  const earned = CATEGORY_IDS.filter((c) => seals.includes(c)).map((c) => tc(CATEGORIES[c].labelPt));
  return (
    <View
      style={styles.sealRow}
      accessible
      accessibilityLabel={earned.length ? t('Selos: {list}', { list: earned.join(', ') }) : t('Nenhum selo ainda')}
    >
      {CATEGORY_IDS.map((id) => {
        const has = seals.includes(id);
        const color = CATEGORIES[id].color;
        return (
          <PopOnFill key={id} filled={has} delayMs={250}>
            <Svg width={size} height={size} viewBox="0 0 24 24">
              {has ? (
                <>
                  <Circle cx={12} cy={12} r={11} fill={color} stroke={brand.gold} strokeWidth={2} />
                  <Path d="M7.5 12.5 L10.6 15.5 L16.5 8.8" fill="none" stroke={CATEGORIES[id].onColor} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <Circle cx={12} cy={12} r={10} fill="none" stroke={color} strokeOpacity={onVelvet ? 0.9 : 0.6} strokeWidth={2} strokeDasharray="3 2.4" />
              )}
            </Svg>
          </PopOnFill>
        );
      })}
    </View>
  );
}

/** Acertos seguidos rumo à Coroa (3 coroinhas). */
export function CrownMeter({ progress, size = 20 }: { progress: number; size?: number }) {
  return (
    <View
      style={styles.crownRow}
      accessible
      accessibilityLabel={t('Coroa: {n} de {max} acertos seguidos', { n: Math.min(progress, GAME_RULES.crownStreak), max: GAME_RULES.crownStreak })}
    >
      {Array.from({ length: GAME_RULES.crownStreak }, (_, i) => (
        <PopOnFill key={i} filled={i < progress} delayMs={200 + i * 60}>
          {i < progress ? <Keter size={size} /> : <Keter size={size} color="transparent" stroke={brand.onVelvetMuted} />}
        </PopOnFill>
      ))}
    </View>
  );
}

/** Medalhão da categoria: nome hebraico em serifa sobre a cor da encadernação. */
export function CategoryMark({ id, size = 56 }: { id: CategoryId; size?: number }) {
  const cat = CATEGORIES[id];
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size / 2, backgroundColor: cat.color }]}>
      <T serif weight="bold" color={cat.onColor} style={{ fontSize: size * 0.34, lineHeight: size * 0.44 }}>
        {cat.shortLabelHe}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  sealRow: { flexDirection: 'row', gap: space.xs + 2 },
  crownRow: { flexDirection: 'row', gap: space.xs },
  mark: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
});

export const pieceRadius = radius.piece;

/**
 * Selo conquistado sendo carimbado: cai grande e girado, bate no lugar e solta uma onda.
 */
export function SealStamp({ id, size = 84 }: { id: CategoryId; size?: number }) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(reducedMotion ? 1 : 2.6);
  const rotate = useSharedValue(reducedMotion ? 0 : -24);
  const opacity = useSharedValue(reducedMotion ? 1 : 0);
  const wave = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withTiming(1, { duration: 120 });
    scale.value = withSpring(1, { damping: 9, stiffness: 260, mass: 0.7 });
    rotate.value = withSpring(0, { damping: 10, stiffness: 200 });
    wave.value = withDelay(180, withTiming(1, { duration: 650 }));
  }, [reducedMotion, opacity, scale, rotate, wave]);
  const stamp = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }] }));
  const ring = useAnimatedStyle(() => ({
    opacity: wave.value === 0 ? 0 : 0.9 * (1 - wave.value),
    transform: [{ scale: 1 + wave.value * 0.9 }],
  }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2, borderWidth: 4, borderColor: CATEGORIES[id].color }, ring]}
      />
      <Animated.View style={stamp}>
        <CategoryMark id={id} size={size} />
      </Animated.View>
    </View>
  );
}
