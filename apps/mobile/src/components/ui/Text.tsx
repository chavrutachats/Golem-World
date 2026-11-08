import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/theme/theme';
import { fonts, type as scale } from '@/theme/tokens';

type Variant = keyof typeof scale;
type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

export interface TProps extends TextProps {
  variant?: Variant;
  weight?: Weight;
  /** Frank Ruhl Libre: texto de estudo (perguntas, citações, nomes hebraicos). */
  serif?: boolean;
  /** Frank Ruhl Libre Black, a voz dos títulos (padrão nas variantes display e hero). */
  display?: boolean;
  color?: string;
  muted?: boolean;
  align?: TextStyle['textAlign'];
}

const LINE: Record<Variant, number> = {
  caption: 18,
  small: 21,
  body: 25,
  lead: 28,
  title: 31,
  display: 38,
  hero: 50,
};

function family(serif: boolean, weight: Weight): string {
  if (serif) return weight === 'bold' || weight === 'semibold' ? fonts.serifBold : fonts.serif;
  return weight === 'bold' ? fonts.uiBold : weight === 'semibold' ? fonts.uiSemibold : weight === 'medium' ? fonts.uiMedium : fonts.ui;
}

export function T({ variant = 'body', weight = 'regular', serif = false, display, color, muted, align, style, ...rest }: TProps) {
  const { colors } = useTheme();
  const size = scale[variant];
  const title = display ?? (variant === 'hero' || variant === 'display');
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: title ? fonts.display : family(serif, weight),
          fontSize: size,
          // Serifas pedem um pouco mais de entrelinha.
          lineHeight: serif || title ? Math.round(LINE[variant] * 1.08) : LINE[variant],
          color: color ?? (muted ? colors.inkMuted : colors.ink),
          letterSpacing: title ? -0.4 : 0,
          ...(align ? { textAlign: align } : {}),
        },
        style,
      ]}
    />
  );
}
