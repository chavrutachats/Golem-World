/**
 * Explosão de confete a partir de um ponto. Muda `burst` para disparar de novo.
 * Com "reduzir movimento" ligado, não aparece.
 */
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { makeParticles, particleAt, type Particle } from '@/lib/confetti';

const Piece = memo(function Piece({ p, t }: { p: Particle; t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const s = particleAt(p, t.value);
    return {
      opacity: t.value === 0 ? 0 : s.opacity,
      transform: [{ translateX: s.x }, { translateY: s.y }, { rotate: `${s.rotate}deg` }],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        { width: p.size, height: p.round ? p.size : p.size * 1.5, borderRadius: p.round ? p.size / 2 : 1.5, backgroundColor: p.color, marginLeft: -p.size / 2 },
        style,
      ]}
    />
  );
});

export function Confetti({
  burst,
  colors,
  count = 26,
  power = 1,
  durationMs = 1300,
  style,
}: {
  /** 0 = nada; cada valor novo dispara uma explosão. */
  burst: number;
  colors: readonly string[];
  count?: number;
  power?: number;
  durationMs?: number;
  style?: object;
}) {
  const reducedMotion = useReducedMotion();
  const t = useSharedValue(0);
  const particles = useMemo(() => makeParticles(count, colors, burst * 7919 + 13, power), [burst, colors, count, power]);

  useEffect(() => {
    if (!burst || reducedMotion) return;
    t.value = 0.0001;
    t.value = withTiming(1, { duration: durationMs, easing: Easing.out(Easing.quad) });
  }, [burst, reducedMotion, durationMs, t]);

  if (!burst || reducedMotion) return null;
  return (
    <View pointerEvents="none" style={[styles.origin, style]}>
      {particles.map((p, i) => (
        <Piece key={`${burst}-${i}`} p={p} t={t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  origin: { position: 'absolute', width: 0, height: 0, overflow: 'visible', zIndex: 20 },
  piece: { position: 'absolute', top: 0, left: 0 },
});
