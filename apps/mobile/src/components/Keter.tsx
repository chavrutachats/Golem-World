/**
 * Keter: a coroa da Torá, desenhada para o app (usada na fatia da Coroa,
 * no medidor de acertos e na escolha do selo).
 */
import Svg, { Circle, Path } from 'react-native-svg';
import { brand } from '@/theme/tokens';

export function Keter({ size = 24, color = brand.gold, stroke = brand.goldDeep }: { size?: number; color?: string; stroke?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path
        d="M5 25 L3.5 10.5 L10.5 16 L16 6.5 L21.5 16 L28.5 10.5 L27 25 Z"
        fill={color}
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path d="M5 25 H27 V28 H5 Z" fill={color} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
      <Circle cx={16} cy={5} r={2.2} fill={color} stroke={stroke} strokeWidth={1.2} />
      <Circle cx={3.5} cy={9.5} r={1.8} fill={color} stroke={stroke} strokeWidth={1.2} />
      <Circle cx={28.5} cy={9.5} r={1.8} fill={color} stroke={stroke} strokeWidth={1.2} />
    </Svg>
  );
}
