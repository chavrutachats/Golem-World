/** Regras de prêmio do "Pedras do Choshen". */
export const PUZZLE_RULES = {
  /** Moedas de sabedoria por estrela nova numa fase (repetir a fase com as mesmas estrelas não dá nada). */
  coinsPerStar: 5,
  /** Jogadas a mais do anúncio com prêmio (uma vez por partida). */
  extraMoves: 5,
  /** Partida aberta há mais tempo que isso não vale mais. */
  runTtlHours: 24,
} as const;

/** Moedas pelas estrelas novas. */
export function puzzleCoins(previousBest: number, stars: number): number {
  return Math.max(0, stars - previousBest) * PUZZLE_RULES.coinsPerStar;
}
