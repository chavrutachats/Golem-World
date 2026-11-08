/**
 * Cronômetro da pergunta: um medalhão com os segundos e um anel que esvazia.
 * Nos últimos 5 segundos o anel fica vermelho, o medalhão pulsa a cada segundo e o
 * relógio faz tique (som e vibração). Usa o prazo do servidor corrigido pela diferença
 * de relógio (lib/countdown.ts) e avisa `onExpire` uma única vez quando zera.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { displaySeconds, isUrgent, remainingMs } from '@/lib/countdown';
import { haptic } from '@/lib/feedback';
import { springs } from '@/lib/motion';
import { play } from '@/lib/sound';
import { brand, fonts } from '@/theme/tokens';
import { T } from './ui/Text';
import { t } from '@/lib/i18n';

const DANGER = '#E5484D';

export interface CountdownRingProps {
  deadlineAt: string;
  offsetMs: number;
  totalMs: number;
  stopped: boolean;
  onExpire: () => void;
  size?: number;
}

export function CountdownRing({ deadlineAt, offsetMs, totalMs, stopped, onExpire, size = 58 }: CountdownRingProps) {
  const reducedMotion = useReducedMotion();
  const [left, setLeft] = useState(() => remainingMs(deadlineAt, Date.now(), offsetMs));
  const expired = useRef(false);
  const lastSecond = useRef<number | null>(null);
  const beat = useSharedValue(1);

  useEffect(() => {
    if (stopped) return;
    const timer = setInterval(() => {
      const ms = remainingMs(deadlineAt, Date.now(), offsetMs);
      setLeft(ms);
      const sec = displaySeconds(ms);
      if (isUrgent(ms) && ms > 0 && sec !== lastSecond.current) {
        lastSecond.current = sec;
        play('clock', 0.8);
        haptic.select();
        if (!reducedMotion) beat.value = withSequence(withTiming(1.16, { duration: 90 }), withSpring(1, springs.pop));
      }
      if (ms <= 0 && !expired.current) {
        expired.current = true;
        clearInterval(timer);
        onExpire();
      }
    }, 100);
    return () => clearInterval(timer);
  }, [deadlineAt, offsetMs, stopped, onExpire, reducedMotion, beat]);

  const urgent = isUrgent(left);
  const seconds = displaySeconds(left);
  const stroke = size * 0.11;
  // Um aro branco em volta do anel, para ele não se misturar com a cor da faixa.
  const r = size / 2 - 3 - stroke / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = Math.max(0, Math.min(1, left / totalMs));
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: beat.value }] }));

  return (
    <Animated.View
      style={[{ width: size, height: size }, pulse]}
      accessibilityRole="progressbar"
      accessibilityLabel={t('Tempo restante')}
      accessibilityValue={{ min: 0, max: Math.round(totalMs / 1000), now: seconds }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="#FFFFFF" />
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(22,37,95,0.12)" strokeWidth={stroke} />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={urgent ? DANGER : brand.velvet}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - fraction)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <T
          style={[styles.number, { fontSize: size * 0.38, lineHeight: size * 0.46 }]}
          color={urgent ? DANGER : brand.velvet}
          accessibilityLiveRegion={urgent ? 'assertive' : 'none'}
        >
          {seconds}
        </T>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  number: { fontFamily: fonts.uiBold, fontVariant: ['tabular-nums'] },
});
