/**
 * A roleta de categorias, com o yad (o ponteiro de leitura da Torá) apontando a fatia.
 *
 * O resultado vem sempre do servidor: a tela chama `spinTo(sliceIndex)` com o índice
 * recebido da API e a roda só anima até lá (ver lib/wheel.ts).
 *
 * Para a roda ter "peso": ela recua um pouco antes de partir, o yad bate em cada cravo
 * do aro (com tique e vibração leve), a roda passa um tiquinho do ponto e volta, e a
 * fatia sorteada pisca.
 */
import { memo, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptic } from '@/lib/feedback';
import { play } from '@/lib/sound';
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { brand, fonts, WHEEL_STYLE } from '@/theme/tokens';
import { pegsPassed, planSpin, polar, restingRotation, SLICE_ANGLE, SLICE_COUNT, sliceCenterAngle, slicePath } from '@/lib/wheel';
import { currentLocale, t, tc } from '@/lib/i18n';

export interface WheelHandle {
  /** Gira até a fatia e resolve quando a roda para. `silent`: sem tique nem vibração. */
  spinTo(index: number, opts?: { silent?: boolean; turns?: number; durationMs?: number; jitter?: number }): Promise<void>;
  /** Posiciona a roda na fatia, sem animação (ex.: ao reabrir a partida). */
  jumpTo(index: number): void;
}

/** Desenho da coroa em coordenadas 32×32, para usar dentro de outro SVG. */
export function KeterGlyph({ x, y, size, color, stroke }: { x: number; y: number; size: number; color: string; stroke: string }) {
  const s = size / 32;
  return (
    <G x={x - size / 2} y={y - size / 2} scale={s}>
      <Path d="M5 25 L3.5 10.5 L10.5 16 L16 6.5 L21.5 16 L28.5 10.5 L27 25 Z" fill={color} stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M5 25 H27 V28 H5 Z" fill={color} stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
      <Circle cx={16} cy={5} r={2.2} fill={color} stroke={stroke} strokeWidth={1.2} />
      <Circle cx={3.5} cy={9.5} r={1.8} fill={color} stroke={stroke} strokeWidth={1.2} />
      <Circle cx={28.5} cy={9.5} r={1.8} fill={color} stroke={stroke} strokeWidth={1.2} />
    </G>
  );
}

const WheelFace = memo(function WheelFace({ size }: { size: number }) {
  const c = size / 2;
  const outer = c - 2;
  const rim = size * 0.055;
  const r1 = outer - rim;
  const hub = size * 0.12;
  const heY = r1 * 0.66;
  const ptY = r1 * 0.44;
  const heSize = size * 0.074;
  const ptSize = size * 0.04;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* aro dourado, como o bordado de um parochet */}
      <Circle cx={c} cy={c} r={outer} fill={brand.gold} stroke={brand.goldDeep} strokeWidth={2} />
      {WHEEL_STYLE.map((s, i) => (
        <Path key={s.slice} d={slicePath(c, c, hub, r1, i)} fill={s.color} stroke="#F5F6FA" strokeWidth={2} strokeLinejoin="round" />
      ))}
      <Circle cx={c} cy={c} r={r1} fill="none" stroke={brand.goldDeep} strokeWidth={1.5} />
      {/* cravos no aro, um em cada divisa de fatia */}
      {Array.from({ length: SLICE_COUNT }, (_, i) => {
        const p = polar(c, c, outer - rim / 2, i * SLICE_ANGLE);
        return <Circle key={i} cx={p.x} cy={p.y} r={rim * 0.24} fill={brand.velvet} stroke={brand.goldDeep} strokeWidth={1} />;
      })}
      {WHEEL_STYLE.map((s, i) => (
        <G key={`label-${s.slice}`} rotation={sliceCenterAngle(i)} originX={c} originY={c}>
          {s.slice === 'crown' ? (
            <KeterGlyph x={c} y={c - heY + heSize * 0.15} size={heSize * 1.25} color={brand.onGold} stroke={brand.onGold} />
          ) : (
            <SvgText
              x={c}
              y={c - heY + heSize * 0.35}
              fill={s.onColor}
              fontSize={heSize}
              fontFamily={fonts.serifBold}
              textAnchor="middle"
            >
              {s.labelHe}
            </SvgText>
          )}
          {/* Em hebraico, o nome de cima já é o da categoria. */}
          {currentLocale() === 'he' ? null : (
            <SvgText x={c} y={c - ptY + ptSize * 0.35} fill={s.onColor} fontSize={ptSize} fontFamily={fonts.uiMedium} textAnchor="middle">
              {tc(s.labelPt)}
            </SvgText>
          )}
        </G>
      ))}
      <Circle cx={c} cy={c} r={hub} fill={brand.velvet} stroke={brand.gold} strokeWidth={size * 0.014} />
      <Circle cx={c} cy={c} r={hub * 0.28} fill={brand.gold} />
    </Svg>
  );
});

/**
 * O yad: argola, haste afunilada e a mão fechada com o indicador estendido para baixo,
 * como o ponteiro usado na leitura da Torá.
 */
function Yad({ width }: { width: number }) {
  const height = width * (112 / 40);
  // Contorno em azul-escuro para o yad se destacar do aro dourado da roda.
  const g = { fill: brand.gold, stroke: brand.velvetDeep, strokeWidth: 1.3, strokeLinejoin: 'round' as const };
  return (
    <Svg width={width} height={height} viewBox="0 0 40 112">
      <Ellipse cx={21} cy={109} rx={4.5} ry={1.8} fill="rgba(0,0,0,0.3)" />
      {/* argola e remate */}
      <Circle cx={20} cy={6} r={4.2} fill="none" stroke={brand.velvetDeep} strokeWidth={4.6} />
      <Circle cx={20} cy={6} r={4.2} fill="none" stroke={brand.gold} strokeWidth={2.4} />
      <Ellipse cx={20} cy={13} rx={5.5} ry={3} {...g} />
      {/* haste afunilada com uma faixa no meio */}
      <Path d="M17.2 15 L22.8 15 L24.4 56 L15.6 56 Z" {...g} />
      <Rect x={15.6} y={32} width={8.8} height={4} rx={2} fill={brand.goldDeep} />
      {/* punho */}
      <Rect x={13} y={55} width={14} height={7} rx={2.5} {...g} />
      <Path d="M14 58.5 H26" stroke={brand.goldDeep} strokeWidth={1} />
      {/* mão fechada: palma, três dedos dobrados à direita e o polegar à esquerda */}
      <Rect x={11.5} y={61} width={17} height={19} rx={7} {...g} />
      <Circle cx={28.2} cy={65.5} r={3} {...g} />
      <Circle cx={28.6} cy={70.6} r={3} {...g} />
      <Circle cx={28} cy={75.6} r={2.8} {...g} />
      <Ellipse cx={11.6} cy={70} rx={3.2} ry={6} {...g} />
      {/* indicador estendido */}
      <Rect x={16.6} y={74} width={7} height={33} rx={3.5} {...g} />
      <Path d="M17.9 101.5 Q20.1 103.8 22.3 101.5" fill="none" stroke={brand.velvetDeep} strokeWidth={1} />
    </Svg>
  );
}

/** Brilho sobre uma fatia (gira junto com a roda). */
const SliceGlow = memo(function SliceGlow({ size, index }: { size: number; index: number }) {
  const c = size / 2;
  const r1 = c - 2 - size * 0.055;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Path d={slicePath(c, c, size * 0.12, r1, index)} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={4} strokeLinejoin="round" />
    </Svg>
  );
});

const WIND_UP_DEG = 9;
const OVERSHOOT_DEG = 2.5;

export function Wheel({ size, ref }: { size: number; ref?: Ref<WheelHandle> }) {
  // Em repouso, a roda começa centrada na Torá.
  const rotation = useSharedValue(restingRotation(0));
  const spinning = useSharedValue(0);
  const yad = useSharedValue(0);
  const glow = useSharedValue(0);
  const [glowIndex, setGlowIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const lastTick = useRef(0);
  const silent = useRef(false);

  const onPeg = () => {
    const now = Date.now();
    if (silent.current || now - lastTick.current < 40) return;
    lastTick.current = now;
    play('tick', 0.7);
    haptic.select();
  };

  // Cada cravo que passa pelo yad: um tranco no ponteiro e um tique.
  useAnimatedReaction(
    () => pegsPassed(rotation.value),
    (now, before) => {
      if (spinning.value === 0 || before === null || now === before) return;
      if (!reducedMotion) {
        yad.value = withSequence(withTiming(-15, { duration: 40 }), withSpring(0, { damping: 6, stiffness: 320, mass: 0.5 }));
      }
      scheduleOnRN(onPeg);
    },
    [reducedMotion],
  );

  useImperativeHandle(
    ref,
    () => ({
      spinTo(index: number, opts = {}) {
        silent.current = !!opts.silent;
        const plan = planSpin(rotation.value, index, {
          jitter: opts.jitter ?? Math.random() * 2 - 1,
          reducedMotion,
          ...(opts.turns !== undefined ? { turns: opts.turns } : {}),
          ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
        });
        const easing = Easing.bezier(0.15, 0.75, 0.2, 1);
        setGlowIndex(index);
        glow.value = 0;
        spinning.value = 1;
        if (reducedMotion) {
          rotation.value = withTiming(plan.target, { duration: plan.durationMs, easing });
        } else {
          const start = rotation.value;
          rotation.value = withSequence(
            withTiming(start - WIND_UP_DEG, { duration: 220, easing: Easing.out(Easing.quad) }),
            withTiming(plan.target + OVERSHOOT_DEG, { duration: plan.durationMs, easing }),
            withSpring(plan.target, { damping: 9, stiffness: 140, mass: 0.8 }),
          );
        }
        const total = reducedMotion ? plan.durationMs : plan.durationMs + 220 + 380;
        return new Promise<void>((resolve) =>
          setTimeout(() => {
            spinning.value = 0;
            // A fatia sorteada pisca duas vezes e apaga.
            glow.value = reducedMotion
              ? withSequence(withTiming(0.3, { duration: 150 }), withDelay(900, withTiming(0, { duration: 300 })))
              : withSequence(
                  withTiming(0.55, { duration: 140 }),
                  withTiming(0.1, { duration: 220 }),
                  withTiming(0.5, { duration: 160 }),
                  withTiming(0.25, { duration: 260 }),
                  withDelay(1200, withTiming(0, { duration: 400 })),
                );
            resolve();
          }, total),
        );
      },
      jumpTo(index: number) {
        rotation.value = restingRotation(index);
        glow.value = 0;
      },
    }),
    [rotation, reducedMotion, glow, spinning],
  );

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const yadStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${yad.value}deg` }] }));
  const yadWidth = Math.round(size * 0.13);

  return (
    <View
      style={{ width: size, height: size + yadWidth * 1.35 }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('Roleta de categorias')}
    >
      <Animated.View style={[{ width: size, height: size, marginTop: yadWidth * 1.35 }, spinStyle]}>
        <WheelFace size={size} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glowStyle]}>
          <SliceGlow size={size} index={glowIndex} />
        </Animated.View>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.yad, { left: size / 2 - yadWidth / 2, transformOrigin: 'top' }, yadStyle]}>
        <Yad width={yadWidth} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  yad: { position: 'absolute', top: 0 },
});
