/**
 * Tokens das telas de jogo (Golem World, puzzle, armário, preparo), na mesma direção de
 * theme/tokens.ts: painéis em tons de tekhelet com fio fino, dourado só no que se ganha
 * ou na ação principal, klaf para texto de fonte. Rubik em tudo; Frank Ruhl Libre Black
 * nos títulos grandes e nos números de destaque.
 */
import type { TrackDef, WorldDef } from '@trivia/shared';
import { brand } from './tokens';

export const gameFonts = {
  medium: 'Rubik_500Medium',
  semibold: 'Rubik_600SemiBold',
  bold: 'Rubik_700Bold',
  /** Títulos e números de destaque (Frank Ruhl Libre Black). */
  display: 'FrankRuhlLibre_900Black',
} as const;

export const g = {
  ink: '#151A38',
  white: brand.onVelvet,
  mist: '#B3BBE3',
  /** Painéis sobre o mundo. */
  velvet: brand.velvet,
  velvetDeep: brand.velvetDeep,
  velvetLine: brand.velvetLine,
  gold: brand.gold,
  goldDeep: brand.goldDeep,
  green: '#3DBB86',
  greenDeep: '#23875E',
  red: '#EF5B6E',
  redDeep: '#B8324A',
  blue: brand.tekhelet,
  blueDeep: '#4D58C9',
  paper: brand.klaf,
  paperDeep: brand.klafEdge,
  grey: '#8B91B3',
  greyDeep: '#5E6489',
  heart: '#EF5B6E',
} as const;

/** Cor de texto legível sobre uma cor de trilha (bandeiras, faixas). */
export function onTrack(color: string): string {
  const hex = color.replace('#', '');
  const [r, gg, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r! + 0.7152 * gg! + 0.0722 * b!;
  return lum > 0.6 ? g.ink : g.white;
}

export type { TrackDef, WorldDef };
