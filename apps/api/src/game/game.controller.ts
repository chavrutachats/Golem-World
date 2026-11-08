import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  AnswerRequestSchema,
  CreateGameRequestSchema,
  CrownChoiceRequestSchema,
  RequestQuestionSchema,
  SpinRequestSchema,
  type AnswerResult,
  type GameState,
  type GameSummary,
  type PrepStatus,
  type QuestionForPlayer,
  type SpinResponse,
} from '@trivia/shared';
import type { z } from 'zod';
import { AuthGuard } from '../auth/guards.js';
import { CurrentUser, ZodPipe, type AuthUser } from '../common/http.js';
import { LIMITS } from '../security/rate-limit.js';
import { UserLimit } from '../security/rate-limit.guards.js';
import { GameService } from './game.service.js';
import { GamePrepService } from './prep.service.js';

const GameId = new ParseUUIDPipe({ version: '4' });

@Controller('games')
@UseGuards(AuthGuard)
export class GameController {
  constructor(
    @Inject(GameService) private readonly games: GameService,
    @Inject(GamePrepService) private readonly prep: GamePrepService,
  ) {}

  /** Prepara perguntas no idioma do jogador (o app chama antes de abrir o sevivon). */
  @Post('prepare')
  @HttpCode(200)
  @UserLimit(LIMITS.prepare)
  prepare(@CurrentUser() user: AuthUser): Promise<PrepStatus> {
    return this.prep.prepare(user.id);
  }

  /** Cria uma partida (solo, aleatória ou com amigo) ou entra numa pelo código de convite. */
  @Post()
  @UserLimit(LIMITS.createGame)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(CreateGameRequestSchema)) body: z.infer<typeof CreateGameRequestSchema>,
  ): Promise<GameState> {
    return this.games.create(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<GameSummary[]> {
    return this.games.list(user.id);
  }

  @Get(':id')
  state(@CurrentUser() user: AuthUser, @Param('id', GameId) id: string): Promise<GameState> {
    return this.games.state(user.id, id);
  }

  /** Gira o sevivon. `withPrize`: o app consegue mostrar anúncio com prêmio (a face do Prêmio entra no sorteio). */
  @Post(':id/spin')
  @HttpCode(200)
  spin(
    @CurrentUser() user: AuthUser,
    @Param('id', GameId) id: string,
    @Body(new ZodPipe(SpinRequestSchema)) body: z.infer<typeof SpinRequestSchema>,
  ): Promise<SpinResponse> {
    return this.games.spin(user.id, id, body);
  }

  @Post(':id/question')
  @HttpCode(200)
  question(
    @CurrentUser() user: AuthUser,
    @Param('id', GameId) id: string,
    @Body(new ZodPipe(RequestQuestionSchema)) body: z.infer<typeof RequestQuestionSchema>,
  ): Promise<QuestionForPlayer> {
    return this.games.requestQuestion(user.id, id, body.spinId);
  }

  /** Reabre a pergunta em andamento (ex.: o app foi fechado no meio). Mesmo prazo e mesma ordem. */
  @Get(':id/question')
  currentQuestion(@CurrentUser() user: AuthUser, @Param('id', GameId) id: string): Promise<QuestionForPlayer> {
    return this.games.currentQuestion(user.id, id);
  }

  @Post(':id/crown')
  @HttpCode(200)
  crown(
    @CurrentUser() user: AuthUser,
    @Param('id', GameId) id: string,
    @Body(new ZodPipe(CrownChoiceRequestSchema)) body: z.infer<typeof CrownChoiceRequestSchema>,
  ): Promise<QuestionForPlayer> {
    return this.games.chooseCrown(user.id, id, body.category);
  }

  @Post(':id/answer')
  @HttpCode(200)
  answer(
    @CurrentUser() user: AuthUser,
    @Param('id', GameId) id: string,
    @Body(new ZodPipe(AnswerRequestSchema)) body: z.infer<typeof AnswerRequestSchema>,
  ): Promise<AnswerResult> {
    return this.games.answer(user.id, id, body.playId, body.optionIndex);
  }

  @Post(':id/forfeit')
  @HttpCode(200)
  forfeit(@CurrentUser() user: AuthUser, @Param('id', GameId) id: string): Promise<GameState> {
    return this.games.forfeit(user.id, id);
  }
}
