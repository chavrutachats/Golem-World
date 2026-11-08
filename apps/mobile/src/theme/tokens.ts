/**
 * Tokens de design.
 *
 * Direção visual (Fase 13): "tekhelet e klaf". O fundo é a noite azul-violeta do fio de
 * tekhelet; os painéis são tons dela, separados por um fio fino, sem sombra. O dourado
 * do Mishkan fica só para a ação principal e para os prêmios. O klaf (pergaminho) é
 * reservado ao texto que vem das fontes: a pergunta e as citações. Duas famílias: Frank
 * Ruhl Libre (a serifa dos sefarim impressos, com hebraico) nos títulos, números grandes
 * e citações; Rubik (desenhada também para o hebraico) em todo o resto.
 */
import {
  CATEGORIES,
  CATEGORY_IDS,
  CROWN_COLOR,
  CROWN_ON_COLOR,
  PRIZE_COLOR,
  PRIZE_ON_COLOR,
  WHEEL_SLICES,
  type CategoryId,
  type WheelSlice,
} from '@trivia/shared';

export const brand = {
  /** Painel sobre o fundo. */
  velvet: '#1B2350',
  /** Fundo das telas de jogo. */
  velvetDeep: '#12183D',
  /** Peça elevada (botão secundário, chip ativo). */
  velvetRaised: '#252F66',
  /** Fio que separa os painéis. */
  velvetLine: '#36418A',
  onVelvet: '#F6F7FF',
  onVelvetMuted: '#A8B1DA',
  /** Tekhelet: seleção, foco, progresso. */
  tekhelet: '#7C88FF',
  gold: '#F0BE4E',
  goldDeep: '#C38F25',
  onGold: '#261A05',
  /** Klaf: o texto das fontes. */
  klaf: '#F4EAD3',
  klafEdge: '#DCCBA4',
  klafInk: '#2A2117',
  /** A coroa do sevivon (cor da face, igual em todo o jogo). */
  crown: CROWN_COLOR,
  onCrown: CROWN_ON_COLOR,
} as const;

export interface Palette {
  background: string;
  surface: string;
  surfaceSunken: string;
  ink: string;
  inkMuted: string;
  line: string;
  accent: string;
  onAccent: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  focus: string;
}

export const light: Palette = {
  background: '#F3F4FA',
  surface: '#FFFFFF',
  surfaceSunken: '#E9EBF5',
  ink: '#151A38',
  inkMuted: '#5A6286',
  line: '#DADDEE',
  accent: '#2C3784',
  onAccent: '#FFFFFF',
  success: '#167A50',
  successSoft: '#DFF3EA',
  danger: '#B8283F',
  dangerSoft: '#F9E2E6',
  focus: '#4652D9',
};

export const dark: Palette = {
  background: brand.velvetDeep,
  surface: brand.velvet,
  surfaceSunken: '#161D46',
  ink: brand.onVelvet,
  inkMuted: brand.onVelvetMuted,
  line: '#2E3878',
  accent: brand.gold,
  onAccent: brand.onGold,
  success: '#5BD19E',
  successSoft: '#133B36',
  danger: '#FF8597',
  dangerSoft: '#47202E',
  focus: brand.tekhelet,
};

export const fonts = {
  ui: 'Rubik_400Regular',
  uiMedium: 'Rubik_500Medium',
  uiSemibold: 'Rubik_600SemiBold',
  uiBold: 'Rubik_700Bold',
  serif: 'FrankRuhlLibre_500Medium',
  serifBold: 'FrankRuhlLibre_700Bold',
  /** Títulos e números grandes. */
  display: 'FrankRuhlLibre_900Black',
} as const;

/** Escala tipográfica (proporção ~1,2). */
export const type = {
  caption: 13,
  small: 15,
  body: 17,
  lead: 20,
  title: 24,
  display: 32,
  hero: 44,
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Raios por hierarquia: controles, botões, superfícies, folhas/peças grandes; pílula só em chips. */
export const radius = { control: 12, button: 16, surface: 20, piece: 28, pill: 999 } as const;

export function categoryColors(id: CategoryId): { color: string; onColor: string } {
  return { color: CATEGORIES[id].color, onColor: CATEGORIES[id].onColor };
}

export interface SliceStyle {
  slice: WheelSlice;
  color: string;
  onColor: string;
  labelPt: string;
  labelHe: string;
}

export const WHEEL_STYLE: readonly SliceStyle[] = WHEEL_SLICES.map((slice) =>
  slice === 'crown'
    ? { slice, color: CROWN_COLOR, onColor: CROWN_ON_COLOR, labelPt: 'Coroa', labelHe: 'כתר' }
    : slice === 'prize'
      ? { slice, color: PRIZE_COLOR, onColor: PRIZE_ON_COLOR, labelPt: 'Prêmio', labelHe: 'פרס' }
      : {
          slice,
          color: CATEGORIES[slice].color,
          onColor: CATEGORIES[slice].onColor,
          labelPt: CATEGORIES[slice].shortLabelPt,
          labelHe: CATEGORIES[slice].shortLabelHe,
        },
);

export { CATEGORIES, CATEGORY_IDS };
