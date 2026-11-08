import { z } from 'zod';

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DifficultySchema = z.enum(DIFFICULTIES);

export const DIFFICULTY_LABELS_PT: Readonly<Record<Difficulty, string>> = {
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
  expert: 'Especialista',
};

/** Pontos por acerto, por nível. */
export const DIFFICULTY_POINTS: Readonly<Record<Difficulty, number>> = {
  easy: 10,
  medium: 20,
  hard: 35,
  expert: 50,
};

/**
 * Rubrica fechada usada pelo LLM para rotular cada pergunta.
 * É a fonte única da verdade: o pipeline injeta este texto no prompt gerador,
 * e a documentação do jogo cita o mesmo conteúdo.
 */
export const DIFFICULTY_RUBRIC: Readonly<Record<Difficulty, string>> = {
  easy:
    'Fato explícito e central do trecho, conhecido por quem estudou o básico (personagens, eventos ou mandamentos principais). A resposta salta aos olhos numa leitura simples.',
  medium:
    'Detalhe explícito no trecho, porém secundário: um número, um lugar, quem disse o quê, a ordem dos acontecimentos.',
  hard:
    'Exige relacionar duas partes do trecho, entender o raciocínio do texto ou conhecer o comentário clássico que foi fornecido junto com o trecho.',
  expert:
    'Detalhe técnico de Talmud ou halachá, a posição de um sábio ou comentarista específico entre várias, ou o sentido de um termo em hebraico/aramaico presente no trecho.',
};

/**
 * Faixa de taxa de acerto esperada para cada nível. Usada para recalibrar o rótulo
 * da IA com dados reais dos jogadores.
 */
export const DIFFICULTY_ACCURACY_BANDS: Readonly<Record<Difficulty, { min: number; max: number }>> = {
  easy: { min: 0.75, max: 1 },
  medium: { min: 0.5, max: 0.75 },
  hard: { min: 0.3, max: 0.5 },
  expert: { min: 0, max: 0.3 },
};

/** Mínimo de respostas antes de mexer no nível de uma pergunta. */
export const CALIBRATION_MIN_SAMPLES = 30;
/** Peso (em respostas "virtuais") do rótulo atual na suavização. Evita oscilação com poucos dados. */
export const CALIBRATION_PRIOR_WEIGHT = 10;

export interface CalibrationStats {
  timesServed: number;
  timesCorrect: number;
}

export interface CalibrationResult {
  difficulty: Difficulty;
  changed: boolean;
  /** Taxa de acerto suavizada (ou null se ainda não há amostras suficientes). */
  smoothedAccuracy: number | null;
}

function bandMidpoint(level: Difficulty): number {
  const band = DIFFICULTY_ACCURACY_BANDS[level];
  return (band.min + band.max) / 2;
}

function levelForAccuracy(accuracy: number): Difficulty {
  if (accuracy >= DIFFICULTY_ACCURACY_BANDS.easy.min) return 'easy';
  if (accuracy >= DIFFICULTY_ACCURACY_BANDS.medium.min) return 'medium';
  if (accuracy >= DIFFICULTY_ACCURACY_BANDS.hard.min) return 'hard';
  return 'expert';
}

/**
 * Recalibra o nível de uma pergunta a partir do desempenho real.
 *
 * - Abaixo de {@link CALIBRATION_MIN_SAMPLES} respostas, nada muda.
 * - A taxa de acerto é suavizada puxando-a para o centro da faixa do nível atual.
 * - O nível anda no máximo UM passo por recalibração, para não oscilar.
 */
export function recalibrateDifficulty(current: Difficulty, stats: CalibrationStats): CalibrationResult {
  const { timesServed, timesCorrect } = stats;
  if (!Number.isFinite(timesServed) || timesServed < CALIBRATION_MIN_SAMPLES) {
    return { difficulty: current, changed: false, smoothedAccuracy: null };
  }
  const correct = Math.min(Math.max(timesCorrect, 0), timesServed);
  const smoothed =
    (correct + CALIBRATION_PRIOR_WEIGHT * bandMidpoint(current)) /
    (timesServed + CALIBRATION_PRIOR_WEIGHT);

  const target = levelForAccuracy(smoothed);
  const currentIdx = DIFFICULTIES.indexOf(current);
  const targetIdx = DIFFICULTIES.indexOf(target);
  if (targetIdx === currentIdx) {
    return { difficulty: current, changed: false, smoothedAccuracy: smoothed };
  }
  const step = targetIdx > currentIdx ? 1 : -1;
  const next = DIFFICULTIES[currentIdx + step] ?? current;
  return { difficulty: next, changed: next !== current, smoothedAccuracy: smoothed };
}
