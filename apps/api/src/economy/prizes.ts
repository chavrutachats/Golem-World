/**
 * Prêmios fixos por contexto. O prêmio da rodada, o presente da pausa e a ajuda do
 * anúncio saem de um HMAC do contexto com a chave do servidor: o jogador vê o prêmio
 * antes de decidir assistir, não consegue prevê-lo, e recarregar a tela não o troca.
 */
import { createHmac } from 'node:crypto';
import { BOOST_AD_PRIZES, GIFT_PRIZES, WHEEL_PRIZES, drawPrize, type Prize, type WeightedPrize } from '@trivia/shared';

function u32(key: Buffer, ...parts: string[]): number {
  return createHmac('sha256', key).update(parts.join('\u0000')).digest().readUInt32BE(0);
}

/**
 * Com as vidas cheias, uma vida a mais se perderia (o máximo é 5) e, oferecida no fim de
 * uma fase, ainda parece que o jogador perdeu alguma. Nesse caso a vida sai da tabela.
 */
function forLives(table: readonly WeightedPrize[], livesFull: boolean): readonly WeightedPrize[] {
  return livesFull ? table.filter((e) => e.prize.kind !== 'life') : table;
}

/** Prêmio da rodada (um turno do sevivon). */
export function wheelPrize(key: Buffer, turnId: string, livesFull = false): Prize {
  return drawPrize(forLives(WHEEL_PRIZES, livesFull), u32(key, 'wheel', turnId));
}

/** Presente oferecido antes do anúncio obrigatório. */
export function giftPrize(key: Buffer, userId: string, breakId: string, livesFull = false): Prize {
  return drawPrize(forLives(GIFT_PRIZES, livesFull), u32(key, 'gift', userId, breakId));
}

/** Qual ajuda vem no anúncio "ganhe uma ajuda". */
export function boostPrize(key: Buffer, userId: string, offerId: string): Prize {
  return drawPrize(BOOST_AD_PRIZES, u32(key, 'boost', userId, offerId));
}
