/**
 * Texto das telas de jogo: Rubik (com hebraico) nos tamanhos de leitura; nos grandes
 * (xl, xxl), Frank Ruhl Libre Black, a serifa dos sefarim, para títulos e números de
 * destaque. `display` força uma ou outra.
 */
import { Text, type TextProps, type TextStyle } from 'react-native';
import { g, gameFonts } from '@/theme/game';

const SIZES = { xs: 12, sm: 14, md: 17, lg: 21, xl: 30, xxl: 42 } as const;

export interface GameTextProps extends TextProps {
  size?: keyof typeof SIZES;
  weight?: 'medium' | 'semibold' | 'bold';
  /** Serifa de título (padrão nos tamanhos xl e xxl). */
  display?: boolean;
  color?: string;
  align?: TextStyle['textAlign'];
  /** Sombra macia para texto sobre o cenário 3D. */
  shadow?: boolean;
}

export function GameText({ size = 'md', weight = 'semibold', display, color = g.white, align, shadow, style, ...rest }: GameTextProps) {
  const fontSize = SIZES[size];
  const serif = display ?? (size === 'xl' || size === 'xxl');
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: serif ? gameFonts.display : gameFonts[weight],
          fontSize,
          // A serifa pede mais entrelinha; a Rubik, pouco aperto nos tamanhos médios.
          lineHeight: Math.round(fontSize * (serif ? 1.18 : 1.3)),
          letterSpacing: serif ? -0.3 : size === 'xs' ? 0.2 : 0,
          color,
          ...(align ? { textAlign: align } : {}),
        },
        shadow && { textShadowColor: 'rgba(8,10,32,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
        style,
      ]}
    />
  );
}
