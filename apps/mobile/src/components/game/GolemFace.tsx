/**
 * Retrato do Golem em 2D (avatar das listas, do placar e do cabeçalho), no mesmo
 * barro facetado do boneco 3D: cabeça quadrada de cantos redondos, olhos grandes,
 * bochechas, a palavra אמת na testa e a kipá vestida. Leve: não abre cena 3D.
 */
import type { GolemLook } from '@trivia/shared';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

const KIPPAH: Record<string, { color: string; rim?: string }> = {
  'kipa-azul': { color: '#1D2A78', rim: '#F2B630' },
  'kipa-vermelha': { color: '#D64545' },
  'kipa-shabat': { color: '#FFFFFF', rim: '#F2B630' },
};

export function GolemFace({ look, size = 44, bot = false }: { look?: GolemLook | undefined; size?: number; bot?: boolean }) {
  const head = look?.equipped?.head;
  const k = head ? KIPPAH[head] : undefined;
  const glasses = look?.equipped?.face === 'oculos';
  const clay = bot ? '#9AA3B5' : '#B47A55';
  const clayLight = bot ? '#B9C1D1' : '#C99069';
  const clayDark = bot ? '#7C8597' : '#956041';
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no">
      {/* Cabeça facetada: luz em cima à esquerda, sombra embaixo à direita. */}
      <Rect x={5} y={9} width={38} height={34} rx={10} fill={clay} />
      <Path d="M15 9h18a10 10 0 0 1 10 10v3H5v-3A10 10 0 0 1 15 9Z" fill={clayLight} />
      <Path d="M43 30v3a10 10 0 0 1-10 10H15a10 10 0 0 1-8.6-5H43Z" fill={clayDark} opacity={0.55} />
      {/* אמת */}
      <G fill="#FFD04A">
        <Rect x={17} y={14} width={3.6} height={1.2} rx={0.4} />
        <Rect x={22.2} y={14} width={3.6} height={1.2} rx={0.4} />
        <Rect x={27.4} y={14} width={3.6} height={1.2} rx={0.4} />
        <Rect x={19.4} y={14} width={1.2} height={4} rx={0.4} />
        <Rect x={24.6} y={14} width={1.2} height={4} rx={0.4} />
        <Rect x={22.2} y={17} width={2.4} height={1.1} rx={0.4} />
        <Path d="M27.6 18.2 30.6 14.2" stroke="#FFD04A" strokeWidth={1.3} strokeLinecap="round" />
      </G>
      {/* Olhos e brilho */}
      <Ellipse cx={17.5} cy={27} rx={3.4} ry={4} fill="#2A1C14" />
      <Ellipse cx={30.5} cy={27} rx={3.4} ry={4} fill="#2A1C14" />
      <Circle cx={18.6} cy={25.6} r={1.2} fill="#FFFFFF" />
      <Circle cx={31.6} cy={25.6} r={1.2} fill="#FFFFFF" />
      {glasses ? (
        <G stroke="#3B2A20" strokeWidth={1.6} fill="rgba(220,240,255,0.25)">
          <Circle cx={17.5} cy={27} r={5.6} />
          <Circle cx={30.5} cy={27} r={5.6} />
          <Path d="M23 26.4h2" />
        </G>
      ) : null}
      <Circle cx={11.6} cy={32.6} r={2.6} fill="#E79A86" opacity={0.85} />
      <Circle cx={36.4} cy={32.6} r={2.6} fill="#E79A86" opacity={0.85} />
      <Path d="M20.5 33.4c1.8 2.2 5.2 2.2 7 0" stroke="#2A1C14" strokeWidth={1.8} fill="none" strokeLinecap="round" />
      {k ? (
        <G>
          <Path d="M13 10.6c1.6-5.4 20.4-5.4 22 0Z" fill={k.color} />
          {k.rim ? <Path d="M13 10.6h22" stroke={k.rim} strokeWidth={1.6} strokeLinecap="round" /> : null}
        </G>
      ) : null}
      {bot ? <Rect x={22.4} y={2} width={3.2} height={7} rx={1.6} fill="#7C8597" /> : null}
      {bot ? <Circle cx={24} cy={2.6} r={2.4} fill="#4C8DF0" /> : null}
    </Svg>
  );
}
