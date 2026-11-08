/**
 * Revelação da categoria sorteada: a tela ganha a cor da categoria, raios giram atrás
 * do medalhão, que chega quicando, e o nome sobe. Dura pouco mais de um segundo,
 * enquanto a pergunta é buscada.
 */
import { CATEGORIES, type WheelSlice } from '@trivia/shared';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { springs } from '@/lib/motion';
import { brand, fonts } from '@/theme/tokens';
import { CategoryMark } from '../GamePieces';
import { Keter } from '../Keter';
import { T } from '../ui/Text';
import { t, tc } from '@/lib/i18n';

function Rays({ size, color }: { size: number; color: string }) {
  const c = size / 2;
  const rays = 14;
  const d = Array.from({ length: rays }, (_, i) => {
    const a0 = (i * 2 * Math.PI) / rays;
    const a1 = a0 + Math.PI / rays;
    return `M ${c} ${c} L ${c + c * Math.cos(a0)} ${c + c * Math.sin(a0)} L ${c + c * Math.cos(a1)} ${c + c * Math.sin(a1)} Z`;
  }).join(' ');
  return (
    <Svg width={size} height={size}>
      <Path d={d} fill={color} />
    </Svg>
  );
}

/** O que a revelação mostra: uma categoria ou a Coroa (o Prêmio abre a folha do prêmio). */
export type RevealSlice = Exclude<WheelSlice, 'prize'>;

export function CategoryReveal({ slice, subtitle }: { slice: RevealSlice; subtitle: string }) {
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const spin = useSharedValue(0);
  useEffect(() => {
    if (!reducedMotion) spin.value = withRepeat(withTiming(360, { duration: 9000, easing: Easing.linear }), -1);
  }, [reducedMotion, spin]);
  const raysStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  const crown = slice === 'crown';
  const bg = crown ? brand.gold : CATEGORIES[slice].color;
  const fg = crown ? brand.onGold : CATEGORIES[slice].onColor;
  const label = crown ? t('Coroa!') : tc(CATEGORIES[slice].labelPt);
  const raysSize = Math.max(width, height) * 1.5;
  const markSize = Math.min(width * 0.42, 168);

  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(200)}
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: bg }]}
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${label}. ${subtitle}`}
    >
      {!reducedMotion ? (
        <Animated.View pointerEvents="none" style={[styles.rays, { width: raysSize, height: raysSize, marginLeft: -raysSize / 2, marginTop: -raysSize / 2 }, raysStyle]}>
          <Rays size={raysSize} color={fg === '#FFFFFF' ? 'rgba(255,255,255,0.13)' : 'rgba(24,32,58,0.10)'} />
        </Animated.View>
      ) : null}
      <Animated.View entering={reducedMotion ? undefined : ZoomIn.springify().damping(springs.pop.damping).stiffness(springs.pop.stiffness)}>
        {crown ? (
          <View style={[styles.crownDisc, { width: markSize, height: markSize, borderRadius: markSize / 2 }]}>
            <Keter size={markSize * 0.62} color={brand.gold} stroke={brand.onGold} />
          </View>
        ) : (
          <CategoryMark id={slice} size={markSize} />
        )}
      </Animated.View>
      <Animated.View entering={reducedMotion ? undefined : FadeInUp.delay(160).springify().damping(14)} style={styles.texts}>
        <T style={[styles.label, { color: fg }]}>{label}</T>
        <T variant="lead" weight="medium" color={fg} align="center" style={styles.sub}>
          {subtitle}
        </T>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', zIndex: 50, overflow: 'hidden' },
  rays: { position: 'absolute', top: '45%', left: '50%' },
  crownDisc: { backgroundColor: brand.velvet, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)' },
  texts: { marginTop: 22, alignItems: 'center', paddingHorizontal: 24 },
  label: { fontFamily: fonts.uiBold, fontSize: 46, lineHeight: 54, letterSpacing: -0.5 },
  sub: { opacity: 0.92, marginTop: 4 },
});
