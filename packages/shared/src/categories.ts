import { z } from 'zod';

/**
 * As 6 categorias da roleta. Os ids são estáveis: aparecem no banco (enum Prisma),
 * na API e no app. Para renomear algo na interface, mude só os rótulos.
 */
export const CATEGORY_IDS = [
  'torah',
  'neviim_ketuvim',
  'mishnah',
  'talmud',
  'halakhah',
  'midrash_aggadah',
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export const CategoryIdSchema = z.enum(CATEGORY_IDS);

/**
 * Padrão de caminho de categorias do Sefaria. Cada segmento é comparado por igualdade,
 * ou por prefixo quando termina em `*` ("Seder *" casa com "Seder Zeraim").
 * O padrão casa com o INÍCIO do caminho do livro.
 */
export type SefariaPathPattern = readonly string[];

export interface CategoryDefinition {
  id: CategoryId;
  /** Rótulo exibido no app (pt-BR). */
  labelPt: string;
  /** Rótulo curto, para a roleta e espaços apertados. */
  shortLabelPt: string;
  labelEn: string;
  labelHe: string;
  /** Rótulo hebraico curto (roleta). */
  shortLabelHe: string;
  /**
   * Cor da categoria (hex), em tons de encadernação de sefarim. Mantida aqui para
   * app e materiais de divulgação usarem a mesma.
   */
  color: string;
  /** Cor do texto sobre `color` (contraste mínimo 4,5:1). */
  onColor: string;
  /**
   * Quais livros do Sefaria alimentam a categoria, pelo caminho de categorias
   * (campo `categories` do books.json / dos arquivos do export).
   * Livros de comentário são excluídos por {@link SEFARIA_EXCLUDED_SEGMENTS}.
   */
  sefariaInclude: readonly SefariaPathPattern[];
}

export const CATEGORIES: Readonly<Record<CategoryId, CategoryDefinition>> = {
  torah: {
    id: 'torah',
    labelPt: 'Torá',
    shortLabelPt: 'Torá',
    labelEn: 'Torah',
    labelHe: 'תורה',
    shortLabelHe: 'תורה',
    color: '#B4233F',
    onColor: '#FFFFFF',
    sefariaInclude: [['Tanakh', 'Torah']],
  },
  neviim_ketuvim: {
    id: 'neviim_ketuvim',
    labelPt: 'Profetas e Escritos',
    shortLabelPt: 'Profetas',
    labelEn: 'Prophets & Writings',
    labelHe: 'נביאים וכתובים',
    shortLabelHe: 'נ״ך',
    color: '#6B45C2',
    onColor: '#FFFFFF',
    sefariaInclude: [
      ['Tanakh', 'Prophets'],
      ['Tanakh', 'Writings'],
    ],
  },
  mishnah: {
    id: 'mishnah',
    labelPt: 'Mishná',
    shortLabelPt: 'Mishná',
    labelEn: 'Mishnah',
    labelHe: 'משנה',
    shortLabelHe: 'משנה',
    color: '#0F7E73',
    onColor: '#FFFFFF',
    sefariaInclude: [['Mishnah', 'Seder *']],
  },
  talmud: {
    id: 'talmud',
    labelPt: 'Talmud',
    shortLabelPt: 'Talmud',
    labelEn: 'Talmud',
    labelHe: 'תלמוד',
    shortLabelHe: 'תלמוד',
    color: '#D9822B',
    onColor: '#18203A',
    sefariaInclude: [['Talmud', 'Bavli', 'Seder *']],
  },
  halakhah: {
    id: 'halakhah',
    labelPt: 'Halachá',
    shortLabelPt: 'Halachá',
    labelEn: 'Halakhah',
    labelHe: 'הלכה',
    shortLabelHe: 'הלכה',
    color: '#2E7D3A',
    onColor: '#FFFFFF',
    sefariaInclude: [
      ['Halakhah', 'Mishneh Torah', 'Sefer *'],
      ['Halakhah', 'Shulchan Arukh'],
    ],
  },
  midrash_aggadah: {
    id: 'midrash_aggadah',
    labelPt: 'Midrash e Agadá',
    shortLabelPt: 'Midrash',
    labelEn: 'Midrash & Aggadah',
    labelHe: 'מדרש ואגדה',
    shortLabelHe: 'מדרש',
    color: '#2774C0',
    onColor: '#FFFFFF',
    sefariaInclude: [
      ['Midrash', 'Aggadah'],
      ['Midrash', 'Halakhah'],
    ],
  },
};

/**
 * Segmentos que marcam comentários e obras derivadas no acervo do Sefaria
 * (ex.: "Talmud > Bavli > Rishonim on Talmud > Rashi"). Qualquer livro cujo caminho
 * contenha um destes segmentos fica fora do jogo: as perguntas cobram o texto-base.
 */
export const SEFARIA_EXCLUDED_SEGMENTS: readonly string[] = [
  'Commentary',
  'Rishonim on *',
  'Acharonim on *',
  'Modern Commentary*',
  'Minor Tractates',
  'Guides',
];

function segmentMatches(pattern: string, segment: string): boolean {
  return pattern.endsWith('*') ? segment.startsWith(pattern.slice(0, -1)) : segment === pattern;
}

/** Verdadeiro se o caminho do livro começa com o padrão. */
export function sefariaPathMatches(pattern: SefariaPathPattern, categories: readonly string[]): boolean {
  if (categories.length < pattern.length) return false;
  return pattern.every((p, i) => segmentMatches(p, categories[i]!));
}

/** Verdadeiro se o caminho pertence a um comentário ou obra derivada. */
export function isExcludedSefariaPath(categories: readonly string[]): boolean {
  return categories.some((segment) => SEFARIA_EXCLUDED_SEGMENTS.some((p) => segmentMatches(p, segment)));
}

/**
 * Títulos que ficam fora mesmo estando numa categoria aceita: notas editoriais,
 * introduções, comentários catalogados junto do texto-base e compilações modernas.
 */
export const SEFARIA_EXCLUDED_TITLE_PATTERNS: readonly RegExp[] = [
  /\bfootnotes\b/i,
  /\bnotes and corrections\b/i,
  /\bintroduction\b/i,
  /^Peri Megadim\b/i,
  /^Legends of the Jews$/i,
];

export function isExcludedSefariaTitle(title: string): boolean {
  return SEFARIA_EXCLUDED_TITLE_PATTERNS.some((re) => re.test(title));
}

/**
 * Categoria do jogo para um livro do Sefaria, ou null se o livro não entra no jogo.
 * @param title opcional; quando informado, também aplica {@link SEFARIA_EXCLUDED_TITLE_PATTERNS}.
 */
export function categoryForSefariaPath(categories: readonly string[], title?: string): CategoryId | null {
  if (isExcludedSefariaPath(categories)) return null;
  if (title && isExcludedSefariaTitle(title)) return null;
  for (const id of CATEGORY_IDS) {
    if (CATEGORIES[id].sefariaInclude.some((pattern) => sefariaPathMatches(pattern, categories))) return id;
  }
  return null;
}

/** Face especial do sevivon que dá direito a disputar um selo. */
export const CROWN_SLICE = 'crown' as const;
export const CROWN_COLOR = '#E8B830';
/** Texto sobre a cor da Coroa. */
export const CROWN_ON_COLOR = '#16255F';

/**
 * Face do prêmio (Fase 12): mostra o prêmio da rodada, que sai assistindo a um anúncio
 * se o jogador quiser. Não conta como jogada: depois dela, gira-se de novo. O prêmio vale
 * fora da partida (moedas, vidas, ajudas do Golem World), como todo prêmio de anúncio.
 */
export const PRIZE_SLICE = 'prize' as const;
export const PRIZE_COLOR = '#F4ECDD';
export const PRIZE_ON_COLOR = '#8E1F2F';

/**
 * As faces do sevivon, na ordem em que estão no corpo dele: as 6 categorias, a Coroa e o
 * Prêmio. O nome `WHEEL_SLICES` vem da roleta (até a Fase 11) e continua no banco.
 */
export const WHEEL_SLICES = [...CATEGORY_IDS, CROWN_SLICE, PRIZE_SLICE] as const;
export type WheelSlice = (typeof WHEEL_SLICES)[number];
export const WheelSliceSchema = z.enum(WHEEL_SLICES);

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && (CATEGORY_IDS as readonly string[]).includes(value);
}
