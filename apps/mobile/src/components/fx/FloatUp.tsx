/** Texto que sobe e some (ex.: "+20" ao acertar). */
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { springs } from '@/lib/motion';
import { brand, fonts } from '@/theme/tokens';

export function FloatUp({ text, color = brand.gold, delayMs = 120, style }: { text: string; color?: string; delayMs?: number; style?: object }) {
  const reducedMotion = useReducedMotion();
  const y = useSharedValue(0);
  const o = useSharedValue(0);
  const s = useSharedValue(0.4);
  useEffect(() => {
    o.value = withDelay(delayMs, withSequence(withTiming(1, { duration: 120 }), withDelay(reducedMotion ? 900 : 650, withTiming(0, { duration: 350 }))));
    s.value = withDelay(delayMs, withSpring(1, springs.pop));
    if (!reducedMotion) y.value = withDelay(delayMs, withTiming(-46, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [delayMs, reducedMotion, o, s, y]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }, { scale: s.value }] }));
  return (
    <Animated.Text pointerEvents="none" accessibilityElementsHidden style={[styles.text, { color }, style, anim]}>
      {text}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  text: {
    position: 'absolute',
    fontFamily: fonts.uiBold,
    fontSize: 26,
    textShadowColor: 'rgba(15,26,69,0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    zIndex: 30,
  },
});
