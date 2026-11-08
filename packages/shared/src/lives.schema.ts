/**
 * Vidas da roleta no contrato HTTP (módulo à parte para a economia e a roleta usarem
 * sem importar uma à outra).
 */
import { z } from 'zod';

const IsoDate = z.iso.datetime({ offset: true });

/** Vidas da roleta: cada erro gasta uma; elas voltam sozinhas com o tempo. */
export const LivesSchema = z.object({
  lives: z.number().int().min(0),
  max: z.number().int().min(1),
  /** Quando volta a próxima vida (null com as vidas cheias). */
  nextLifeAt: IsoDate.nullable(),
});
export type Lives = z.infer<typeof LivesSchema>;
