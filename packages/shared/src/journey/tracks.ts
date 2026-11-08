/**
 * Trilhas do Golem World. A trilha principal de cada parashá é a própria Torá;
 * as demais (subcaminhos) só abrem depois que o jogador completa a Torá daquela
 * parashá: todo o estudo parte do texto da Torá.
 */
import { z } from 'zod';
import type { CategoryId } from '../categories.js';
import type { TorahBook } from './refs.js';

export const JOURNEY_TRACKS = ['torah', 'mishnah', 'talmud', 'midrash', 'commentators', 'kabbalah', 'mitzvot'] as const;
export type JourneyTrack = (typeof JOURNEY_TRACKS)[number];
export const JourneyTrackSchema = z.enum(JOURNEY_TRACKS);

export const SUB_TRACKS = JOURNEY_TRACKS.filter((t) => t !== 'torah') as Exclude<JourneyTrack, 'torah'>[];
export type SubTrack = (typeof SUB_TRACKS)[number];

export interface TrackDef {
  id: JourneyTrack;
  labelPt: string;
  labelHe: string;
  /** Uma linha explicando o que se estuda na trilha. */
  descriptionPt: string;
  /** Fontes do Sefaria usadas, em linguagem de gente. */
  sourcesPt: string;
  /** Cor do marcador no mapa (paleta de 16 bits). */
  color: string;
  /** Categoria da roleta equivalente (quando há), para reaproveitar perguntas. */
  category: CategoryId | null;
}

export const TRACKS: Readonly<Record<JourneyTrack, TrackDef>> = {
  torah: {
    id: 'torah',
    labelPt: 'Torá',
    labelHe: 'תורה',
    descriptionPt: 'O texto da parashá, versículo por versículo.',
    sourcesPt: 'Texto da Torá (hebraico e traduções)',
    color: '#E83A3A',
    category: 'torah',
  },
  mishnah: {
    id: 'mishnah',
    labelPt: 'Mishná',
    labelHe: 'משנה',
    descriptionPt: 'Mishnayot que citam versículos desta parashá.',
    sourcesPt: 'Mishná e Pirkê Avot',
    color: '#21A38F',
    category: 'mishnah',
  },
  talmud: {
    id: 'talmud',
    labelPt: 'Talmud',
    labelHe: 'גמרא',
    descriptionPt: 'Passagens da Guemará que discutem estes versículos.',
    sourcesPt: 'Talmud Bavli',
    color: '#F08A24',
    category: 'talmud',
  },
  midrash: {
    id: 'midrash',
    labelPt: 'Midrash',
    labelHe: 'מדרש',
    descriptionPt: 'Os sábios contam e interpretam as histórias da parashá.',
    sourcesPt: 'Midrash Rabá',
    color: '#9B5BE0',
    category: 'midrash_aggadah',
  },
  commentators: {
    id: 'commentators',
    labelPt: 'Comentaristas',
    labelHe: 'מפרשים',
    descriptionPt: 'O que Rashi, Ramban, Ibn Ezra e Sforno explicam aqui.',
    sourcesPt: 'Rashi, Ramban, Ibn Ezra e Sforno',
    color: '#2F7DE1',
    // Os comentários explicam a Torá: na roleta, caem em Torá.
    category: 'torah',
  },
  kabbalah: {
    id: 'kabbalah',
    labelPt: 'Cabalá',
    labelHe: 'קבלה',
    descriptionPt: 'O Zohar lê a parashá pelo seu lado oculto.',
    sourcesPt: 'Zohar',
    color: '#3B3F9E',
    // A Cabalá não tem face no sevivon: o Zohar entra em Midrash e Agadá.
    category: 'midrash_aggadah',
  },
  mitzvot: {
    id: 'mitzvot',
    labelPt: 'Mitzvot',
    labelHe: 'מצוות',
    descriptionPt: 'As mitzvot que nascem destes versículos.',
    sourcesPt: 'Sefer HaChinuch',
    color: '#3E9B3A',
    category: 'halakhah',
  },
};

// ---------------------------------------------------------------------------
// Fontes no Sefaria-Export (usadas pelo pipeline para baixar e ingerir)
// ---------------------------------------------------------------------------

export interface CommentatorDef {
  id: string;
  namePt: string;
  /** Pasta no export: json/<path>/<Nome> on <Livro>/… */
  path: readonly string[];
  titleFor(book: TorahBook): string;
}

export const COMMENTATORS: readonly CommentatorDef[] = [
  { id: 'rashi', namePt: 'Rashi', path: ['Tanakh', 'Rishonim on Tanakh', 'Rashi', 'Torah'], titleFor: (b) => `Rashi on ${b}` },
  { id: 'ramban', namePt: 'Ramban', path: ['Tanakh', 'Rishonim on Tanakh', 'Ramban', 'Torah'], titleFor: (b) => `Ramban on ${b}` },
  { id: 'ibn-ezra', namePt: 'Ibn Ezra', path: ['Tanakh', 'Rishonim on Tanakh', 'Ibn Ezra', 'Torah'], titleFor: (b) => `Ibn Ezra on ${b}` },
  { id: 'sforno', namePt: 'Sforno', path: ['Tanakh', 'Rishonim on Tanakh', 'Sforno', 'Torah'], titleFor: (b) => `Sforno on ${b}` },
];

export interface FixedSourceDef {
  title: string;
  namePt: string;
  path: readonly string[];
  track: SubTrack;
}

/** Livros de trilha com título fixo (os da Mishná e do Talmud vêm das conexões do Sefaria). */
export const FIXED_TRACK_SOURCES: readonly FixedSourceDef[] = [
  { title: 'Bereshit Rabbah', namePt: 'Bereshit Rabá', path: ['Midrash', 'Aggadah', 'Midrash Rabbah'], track: 'midrash' },
  { title: 'Shemot Rabbah', namePt: 'Shemot Rabá', path: ['Midrash', 'Aggadah', 'Midrash Rabbah'], track: 'midrash' },
  { title: 'Vayikra Rabbah', namePt: 'Vayicrá Rabá', path: ['Midrash', 'Aggadah', 'Midrash Rabbah'], track: 'midrash' },
  { title: 'Bamidbar Rabbah', namePt: 'Bamidbar Rabá', path: ['Midrash', 'Aggadah', 'Midrash Rabbah'], track: 'midrash' },
  { title: 'Devarim Rabbah', namePt: 'Devarim Rabá', path: ['Midrash', 'Aggadah', 'Midrash Rabbah'], track: 'midrash' },
  { title: 'Zohar', namePt: 'Zohar', path: ['Kabbalah', 'Zohar'], track: 'kabbalah' },
  { title: 'Sefer HaChinukh', namePt: 'Sefer HaChinuch', path: ['Halakhah', 'Sifrei Mitzvot'], track: 'mitzvot' },
];

/** Nome em português de um livro de trilha ("Mishnah Berakhot" → "Mishná Berachot"). */
export function sourceBookNamePt(title: string): string {
  const fixed = FIXED_TRACK_SOURCES.find((s) => s.title === title);
  if (fixed) return fixed.namePt;
  const comm = COMMENTATORS.find((c) => title.startsWith(`${c.path[2]} on `));
  if (comm) return comm.namePt;
  if (title === 'Pirkei Avot') return 'Pirkê Avot';
  if (title.startsWith('Mishnah ')) return `Mishná ${title.slice('Mishnah '.length)}`;
  return title;
}
