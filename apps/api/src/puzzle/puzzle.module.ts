import { Body, Controller, Get, HttpCode, Inject, Module, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  PuzzleFinishRequestSchema,
  PuzzleStartRequestSchema,
  type PuzzleFinishRequest,
  type PuzzleFinishResult,
  type PuzzleOverview,
  type PuzzleRun,
} from '@trivia/shared';
import type { z } from 'zod';
import { AuthModule } from '../auth/auth.module.js';
import { AuthGuard } from '../auth/guards.js';
import { CurrentUser, ZodPipe, type AuthUser } from '../common/http.js';
import { EconomyModule } from '../economy/economy.module.js';
import { LIMITS } from '../security/rate-limit.js';
import { UserLimit } from '../security/rate-limit.guards.js';
import { PuzzleService } from './puzzle.service.js';

const RunId = new ParseUUIDPipe({ version: '4' });

@Controller('puzzle')
@UseGuards(AuthGuard)
export class PuzzleController {
  constructor(@Inject(PuzzleService) private readonly puzzle: PuzzleService) {}

  /** Fases abertas e estrelas de cada uma. */
  @Get()
  overview(@CurrentUser() user: AuthUser): Promise<PuzzleOverview> {
    return this.puzzle.overview(user.id);
  }

  /** Começa uma partida: devolve a semente do tabuleiro. */
  @Post('runs')
  @HttpCode(200)
  @UserLimit(LIMITS.puzzleRun)
  start(@CurrentUser() user: AuthUser, @Body(new ZodPipe(PuzzleStartRequestSchema)) body: z.infer<typeof PuzzleStartRequestSchema>): Promise<PuzzleRun> {
    return this.puzzle.start(user.id, body.level);
  }

  /** Fim da partida, com todas as jogadas: o servidor refaz e dá o resultado. */
  @Post('runs/:id/finish')
  @HttpCode(200)
  @UserLimit(LIMITS.puzzleRun)
  finish(@CurrentUser() user: AuthUser, @Param('id', RunId) id: string, @Body(new ZodPipe(PuzzleFinishRequestSchema)) body: PuzzleFinishRequest): Promise<PuzzleFinishResult> {
    return this.puzzle.finish(user.id, id, body.moves);
  }
}

@Module({
  imports: [AuthModule, EconomyModule],
  controllers: [PuzzleController],
  providers: [PuzzleService],
})
export class PuzzleModule {}
