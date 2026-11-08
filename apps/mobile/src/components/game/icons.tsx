/**
 * Ícones do jogo em vetor, no mesmo espírito facetado do mundo 3D: coração, moeda de
 * Sabedoria, shekel, estrela, cadeado, bandeira. Desenhados à mão em SVG para ficarem nítidos
 * em qualquer tamanho e iguais no celular e na web.
 */
import Svg, { Circle, G, Path, Polygon, Rect } from 'react-native-svg';
import { g } from '@/theme/game';

interface IconProps {
  size?: number;
  dim?: boolean;
}

export function HeartIcon({ size = 22, dim }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 21 3.2 12.6C.9 10.3 1.3 6.4 4.1 4.7c2.2-1.3 4.8-.6 6.3 1.3L12 7.8l1.6-1.8c1.5-1.9 4.1-2.6 6.3-1.3 2.8 1.7 3.2 5.6.9 7.9Z" fill={dim ? 'rgba(255,255,255,0.18)' : g.heart} />
      {dim ? null : <Path d="M12 21 3.2 12.6C.9 10.3 1.3 6.4 4.1 4.7 6 3.6 8.2 3.9 9.8 5.2L12 21Z" fill="#FF7A7F" />}
      {dim ? null : <Circle cx={7} cy={8} r={1.6} fill="#FFD3D5" />}
    </Svg>
  );
}

/** Moeda de Sabedoria: dourada, com um rolo da Torá estampado. */
export function CoinIcon({ size = 22, dim }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10.5} fill={dim ? g.grey : g.goldDeep} />
      <Circle cx={12} cy={11.2} r={9.6} fill={dim ? '#C4C8D6' : g.gold} />
      <G fill={dim ? g.greyDeep : '#B9780F'}>
        <Rect x={7.2} y={7} width={2.2} height={9} rx={1.1} />
        <Rect x={14.6} y={7} width={2.2} height={9} rx={1.1} />
        <Rect x={9.2} y={8.2} width={5.6} height={6.6} rx={0.6} />
      </G>
      <Rect x={10.2} y={9.6} width={3.6} height={0.9} rx={0.45} fill={dim ? '#C4C8D6' : '#FFE9A8'} />
      <Rect x={10.2} y={11.5} width={3.6} height={0.9} rx={0.45} fill={dim ? '#C4C8D6' : '#FFE9A8'} />
    </Svg>
  );
}

/** Shekel: moeda de prata com a romã, como nos shekels antigos de Jerusalém. */
export function ShekelIcon({ size = 22, dim }: IconProps) {
  const rim = dim ? g.greyDeep : '#8D98AE';
  const face = dim ? '#C4C8D6' : '#DCE3EF';
  const fruit = dim ? g.greyDeep : '#C2364A';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10.5} fill={rim} />
      <Circle cx={12} cy={11.2} r={9.6} fill={face} />
      <Circle cx={12} cy={11.2} r={8.1} fill="none" stroke={rim} strokeWidth={0.8} strokeDasharray="1.2 1.4" />
      <Circle cx={12} cy={13} r={4.1} fill={fruit} />
      <Path d="M9.6 9.6 10.4 6.9 11.3 8.6 12 6.4 12.7 8.6 13.6 6.9 14.4 9.6Z" fill={fruit} />
      {dim ? null : <Circle cx={10.6} cy={11.8} r={1.1} fill="#E8798A" />}
    </Svg>
  );
}

export function StarIcon({ size = 22, dim }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon points="12,1.8 15,8.4 22.2,9.1 16.8,14 18.4,21.1 12,17.4 5.6,21.1 7.2,14 1.8,9.1 9,8.4" fill={dim ? 'rgba(255,255,255,0.2)' : g.gold} />
      {dim ? null : <Polygon points="12,1.8 15,8.4 22.2,9.1 16.8,14 12,12" fill="#FFE07A" />}
    </Svg>
  );
}

export function LockIcon({ size = 20, color = g.white }: IconProps & { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 10V7.5a5 5 0 0 1 10 0V10" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Rect x={4.5} y={10} width={15} height={11} rx={3} fill={color} />
      <Circle cx={12} cy={15.2} r={1.6} fill={g.velvetDeep} />
    </Svg>
  );
}

export function FlagIcon({ size = 20, color = g.gold }: IconProps & { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={4} y={2.5} width={2.2} height={19} rx={1.1} fill="#E9E2D0" />
      <Path d="M6.2 3.5h12.3l-2.6 4.2 2.6 4.3H6.2Z" fill={color} />
    </Svg>
  );
}
