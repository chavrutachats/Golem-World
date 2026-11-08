/**
 * Recorte do texto em passagens: a unidade que o LLM recebe para gerar perguntas.
 *
 * Passagens curtas demais não sustentam boas perguntas; longas demais diluem a
 * atenção do modelo e encarecem a chamada. Cada categoria tem sua medida, e uma
 * passagem nunca atravessa a fronteira de capítulo/daf/siman (a referência fica
 * simples e o contexto, coeso).
 */
import type { CategoryId, SourceLanguage } from '@trivia/shared';
import { countWords } from '../util.js';

export interface AlignedSegment {
  indices: number[];
  ref: string;
  he?: string;
  en?: string;
  pt?: string;
}

export interface ChunkPolicy {
  /** Máximo de segmentos (versículos, mishnayot, linhas…) por passagem. */
  maxSegments: number;
  /** Teto de palavras por passagem (medido no idioma mais longo). */
  maxWords: number;
  /** Uma sobra menor que isto no fim do capítulo é anexada à passagem anterior. */
  minWords: number;
}

export const CHUNK_POLICIES: Readonly<Record<CategoryId, ChunkPolicy>> = {
  torah: { maxSegments: 5, maxWords: 160, minWords: 30 },
  neviim_ketuvim: { maxSegments: 5, maxWords: 160, minWords: 30 },
  mishnah: { maxSegments: 1, maxWords: 400, minWords: 0 },
  talmud: { maxSegments: 6, maxWords: 220, minWords: 40 },
  halakhah: { maxSegments: 3, maxWords: 220, minWords: 30 },
  midrash_aggadah: { maxSegments: 2, maxWords: 260, minWords: 40 },
};

const LANGS: readonly SourceLanguage[] = ['he', 'en', 'pt'];

export function segmentWords(segment: AlignedSegment): number {
  return Math.max(...LANGS.map((l) => countWords(segment[l])));
}

/** Chave da seção (tudo menos o último índice): segmentos com a mesma chave são do mesmo capítulo. */
function sectionKey(segment: AlignedSegment): string {
  return segment.indices.slice(0, -1).join('.');
}

export function chunkSegments(segments: readonly AlignedSegment[], policy: ChunkPolicy): AlignedSegment[][] {
  const chunks: AlignedSegment[][] = [];
  let current: AlignedSegment[] = [];
  let currentWords = 0;
  let currentSection: string | null = null;

  const flush = () => {
    if (current.length === 0) return;
    const prev = chunks[chunks.length - 1];
    const sameSection = prev && sectionKey(prev[0]!) === sectionKey(current[0]!);
    const prevWords = prev ? prev.reduce((n, s) => n + segmentWords(s), 0) : 0;
    if (prev && sameSection && currentWords < policy.minWords && prevWords + currentWords <= policy.maxWords * 1.5) {
      prev.push(...current);
    } else {
      chunks.push(current);
    }
    current = [];
    currentWords = 0;
  };

  for (const segment of segments) {
    const words = segmentWords(segment);
    const section = sectionKey(segment);
    const fits =
      current.length < policy.maxSegments && (current.length === 0 || currentWords + words <= policy.maxWords);
    if (section !== currentSection || !fits) {
      flush();
      currentSection = section;
    }
    current.push(segment);
    currentWords += words;
  }
  flush();
  return chunks;
}
