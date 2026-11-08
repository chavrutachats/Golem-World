/**
 * Contratos da API do "Pedras do Choshen" (Fase 11).
 */
import { z } from 'zod';
import { EconomyStateSchema } from '../economy/contracts.js';
import { PUZZLE_LEVELS } from './levels.js';

const Cell = z.number().int().min(0).max(15);
export const PuzzleMoveSchema = z.tuple([Cell, Cell, Cell, Cell]);

export const PuzzleLevelSummarySchema = z.object({
  level: z.number().int().min(1).max(PUZZLE_LEVELS),
  /** Melhor resultado (0 = ainda não passou). */
  stars: z.number().int().min(0).max(3),
  bestScore: z.number().int().min(0),
});
export type PuzzleLevelSummary = z.infer<typeof PuzzleLevelSummarySchema>;

export const PuzzleOverviewSchema = z.object({
  /** Maior fase liberada. */
  unlocked: z.number().int().min(1).max(PUZZLE_LEVELS),
  levels: z.array(PuzzleLevelSummarySchema),
  totalStars: z.number().int().min(0),
});
export type PuzzleOverview = z.infer<typeof PuzzleOverviewSchema>;

export const PuzzleStartRequestSchema = z.object({ level: z.number().int().min(1).max(PUZZLE_LEVELS) });

export const PuzzleRunSchema = z.object({
  id: z.uuid(),
  level: z.number().int().min(1).max(PUZZLE_LEVELS),
  /** Semente do tabuleiro: o app monta e joga; o servidor refaz com as jogadas. */
  seed: z.number().int().min(1).max(2_147_483_647),
  /** Jogadas a mais ganhas com anúncio (0 ou 5). */
  extraMoves: z.number().int().min(0),
});
export type PuzzleRun = z.infer<typeof PuzzleRunSchema>;

export const PuzzleFinishRequestSchema = z.object({
  moves: z.array(PuzzleMoveSchema).max(80),
});
export type PuzzleFinishRequest = z.infer<typeof PuzzleFinishRequestSchema>;

export const PuzzleFinishResultSchema = z.object({
  status: z.enum(['won', 'lost', 'abandoned']),
  score: z.number().int().min(0),
  stars: z.number().int().min(0).max(3),
  /** Melhor resultado da fase, já contando esta partida. */
  bestStars: z.number().int().min(0).max(3),
  /** Moedas de sabedoria ganhas (só pelas estrelas novas). */
  coins: z.number().int().min(0),
  unlocked: z.number().int().min(1).max(PUZZLE_LEVELS),
  economy: EconomyStateSchema,
});
export type PuzzleFinishResult = z.infer<typeof PuzzleFinishResultSchema>;
