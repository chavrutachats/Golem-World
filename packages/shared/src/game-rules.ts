import { z } from 'zod';
import { CATEGORY_IDS } from './categories.js';

/**
 * Parâmetros das regras do jogo. As regras em si (máquina de estados do turno)
 * são implementadas no servidor na Fase 3; aqui ficam só as constantes, para o app
 * exibir os mesmos números que o servidor aplica.
 */
export const GAME_RULES = {
  /** Selos necessários para vencer: um por categoria. */
  sealsToWin: CATEGORY_IDS.length,
  /** Acertos seguidos que enchem a Coroa. */
  crownStreak: 3,
  /** Limite de rodadas (cada vez que a vez passa para o outro jogador conta uma rodada). */
  maxRounds: 25,
  /** Tempo para responder cada pergunta. */
  questionTimeLimitSeconds: 30,
  /** Tolerância de rede somada ao prazo, só no servidor. */
  networkGraceSeconds: 3,
  /** Partida assíncrona: sem jogar por este tempo, o jogador perde por W.O. */
  turnTimeoutHours: 48,
  /** Pontos extras ao conquistar um selo. */
  sealBonusPoints: 25,
} as const;

export const GAME_MODES = ['solo', 'random', 'friend'] as const;
export type GameMode = (typeof GAME_MODES)[number];
export const GameModeSchema = z.enum(GAME_MODES);

export const GAME_STATUSES = ['waiting_opponent', 'active', 'finished', 'abandoned'] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];
export const GameStatusSchema = z.enum(GAME_STATUSES);
