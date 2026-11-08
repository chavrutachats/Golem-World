/**
 * As seis pedras do peitoral (Shemot 28:17-18), lapidadas em SVG: cada uma tem cor E
 * forma próprias, para quem não distingue bem as cores. As cores e as formas são do
 * jogo; as identificações das pedras variam entre os comentaristas.
 *
 * Especiais: Raio (faixas de luz na linha ou na coluna), Estrondo (aro dourado) e Urim
 * (uma luz branca com raios, sem cor). Nenhuma pedra tem letra ou texto.
 */
import type { Special } from '@trivia/shared';
import { memo, useId } from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

export const STONE_COLORS = [
  { light: '#FF8A94', base: '#E5374A', dark: '#9E1C2E' }, // Ódem
  { light: '#FFEC8F', base: '#F5C51F', dark: '#B07C0A' }, // Pitdá
  { light: '#8AF0A8', base: '#23B85A', dark: '#11733A' }, // Bareket
  { light: '#DDB0FF', base: '#9B4FE0', dark: '#5C2499' }, // Nófech
  { light: '#9CCBFF', base: '#2F7BEA', dark: '#1B4BA8' }, // Sapir
  { light: '#FFFFFF', base: '#DCEEF9', dark: '#86AECB' }, // Yahalom
] as const;

/** Contorno de cada pedra numa caixa de 100×100. */
const OUTLINES: readonly string[] = [
  // Ódem: quadrado de cantos macios (cabochão)
  'M30 12 H70 Q88 12 88 30 V70 Q88 88 70 88 H30 Q12 88 12 70 V30 Q12 12 30 12 Z',
  // Pitdá: losango
  'M50 6 L92 50 L50 94 L8 50 Z',
  // Bareket: hexágono
  'M50 7 L88 28.5 L88 71.5 L50 93 L12 71.5 L12 28.5 Z',
  // Nófech: triângulo de pontas macias
  'M50 10 Q54 10 57 15 L91 79 Q93 88 84 88 H16 Q7 88 9 79 L43 15 Q46 10 50 10 Z',
  // Sapir: círculo
  'M50 9 A41 41 0 1 1 49.99 9 Z',
  // Yahalom: octógono (corte brilhante)
  'M33 8 H67 L92 33 V67 L67 92 H33 L8 67 V33 Z',
];

/** Faceta clara de cima de cada pedra (dá o volume). */
const FACETS: readonly string[] = [
  'M32 22 H68 Q78 22 78 32 V46 H22 V32 Q22 22 32 22 Z',
  'M50 16 L80 46 H20 Z',
  'M50 17 L79 33.5 V46 H21 V33.5 Z',
  'M50 22 L72 62 H28 Z',
  'M50 19 A31 31 0 0 1 81 47 H19 A31 31 0 0 1 50 19 Z',
  'M36 18 H64 L82 36 V46 H18 V36 Z',
];

/**
 * Id dos gradientes, único por pedra. Na web todos os SVG dividem o mesmo documento: com
 * ids repetidos, o navegador usa o primeiro, e se ele estiver numa tela escondida (a
 * anterior da pilha), a pedra fica sem cor.
 */
function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
}

function Gem({ kind }: { kind: number }) {
  const c = STONE_COLORS[kind]!;
  const id = useSvgId(`stone${kind}`);
  return (
    <>
      <Defs>
        <LinearGradient id={`${id}-body`} x1="0.15" y1="0.05" x2="0.85" y2="0.95">
          <Stop offset="0" stopColor={c.light} />
          <Stop offset="0.45" stopColor={c.base} />
          <Stop offset="1" stopColor={c.dark} />
        </LinearGradient>
        <LinearGradient id={`${id}-facet`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.05" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="50" cy="94" rx="30" ry="5" fill="#000000" opacity="0.22" />
      <Path d={OUTLINES[kind]!} fill={`url(#${id}-body)`} stroke={c.dark} strokeWidth="3" strokeLinejoin="round" />
      <Path d={FACETS[kind]!} fill={`url(#${id}-facet)`} />
      {/* Brilho */}
      <Ellipse cx="36" cy="30" rx="9" ry="5" fill="#FFFFFF" opacity="0.85" transform="rotate(-30 36 30)" />
      <Circle cx="62" cy="68" r="3" fill="#FFFFFF" opacity="0.35" />
    </>
  );
}

function Urim() {
  const id = useSvgId('urim');
  const rays = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <>
      <Defs>
        <RadialGradient id={id} cx="0.5" cy="0.45" r="0.55">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.55" stopColor="#FFF4C2" />
          <Stop offset="1" stopColor="#FFC93C" />
        </RadialGradient>
      </Defs>
      <Ellipse cx="50" cy="94" rx="26" ry="5" fill="#000000" opacity="0.2" />
      <G>
        {rays.map((deg) => (
          <Polygon key={deg} points="50,2 55,30 45,30" fill="#FFE07A" opacity="0.9" transform={`rotate(${deg} 50 50)`} />
        ))}
      </G>
      <Circle cx="50" cy="50" r="27" fill={`url(#${id})`} stroke="#D99A1A" strokeWidth="2.5" />
      <Ellipse cx="42" cy="40" rx="8" ry="5" fill="#FFFFFF" opacity="0.9" transform="rotate(-30 42 40)" />
    </>
  );
}

function SpecialMark({ special }: { special: Exclude<Special, 'urim'> }) {
  if (special === 'bomb') {
    // Estrondo: aro dourado com quatro faíscas, como pólvora prestes a estourar.
    return (
      <>
        <Circle cx="50" cy="50" r="45" fill="none" stroke="#FFF3C4" strokeWidth="10" opacity="0.45" />
        <Circle cx="50" cy="50" r="44" fill="none" stroke="#FFC93C" strokeWidth="5" />
        {[45, 135, 225, 315].map((deg) => (
          <Polygon key={deg} points="50,0 54,8 50,16 46,8" fill="#FFFFFF" stroke="#D99A1A" strokeWidth="1.5" transform={`rotate(${deg} 50 50)`} />
        ))}
      </>
    );
  }
  // Raio: uma faixa de luz atravessando a pedra, com setas para os dois lados.
  return (
    <G transform={special === 'row' ? undefined : 'rotate(90 50 50)'}>
      <Rect x="0" y="38" width="100" height="24" rx="12" fill="#FFFFFF" opacity="0.35" />
      <Rect x="10" y="46" width="80" height="8" rx="4" fill="#FFFFFF" />
      <Polygon points="0,50 14,39 14,61" fill="#FFFFFF" stroke="#D99A1A" strokeWidth="2" strokeLinejoin="round" />
      <Polygon points="100,50 86,39 86,61" fill="#FFFFFF" stroke="#D99A1A" strokeWidth="2" strokeLinejoin="round" />
    </G>
  );
}

export const Stone = memo(function Stone({ kind, special = null, size }: { kind: number; special?: Special | null; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {special === 'urim' || kind < 0 ? (
        <Urim />
      ) : (
        <>
          <Gem kind={kind} />
          {special ? <SpecialMark special={special} /> : null}
        </>
      )}
    </Svg>
  );
});

/** Barro sob a pedra: uma ou duas camadas, com rachaduras. */
export const ClayPatch = memo(function ClayPatch({ hp, size }: { hp: number; size: number }) {
  if (hp <= 0) return null;
  const deep = hp >= 2;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x="3" y="3" width="94" height="94" rx="16" fill={deep ? '#8E5A35' : '#B98256'} />
      <Rect x="3" y="3" width="94" height="94" rx="16" fill="none" stroke={deep ? '#F0C79A' : '#E3B588'} strokeWidth={deep ? 5 : 3} opacity="0.75" />
      <Path d="M18 30 L34 42 L30 58 M70 18 L62 36 L76 48 M58 80 L66 66 L84 72" stroke="#5E3B22" strokeWidth="3" fill="none" strokeLinecap="round" opacity={deep ? 0.5 : 0.35} />
    </Svg>
  );
});
