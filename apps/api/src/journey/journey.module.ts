import { Body, Controller, Get, HttpCode, Inject, Module, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  BuyItemRequestSchema,
  EquipItemRequestSchema,
  JourneyAnswerRequestSchema,
  PowerUpRequestSchema,
  PrepareNodeRequestSchema,
  StartRunRequestSchema,
  type JourneyAnswerResult,
  type PrepStatus,
  type JourneyQuestion,
  type JourneyRun,
  type JourneyState,
  type PowerUpResult,
  type ShopState,
} from '@trivia/shared';
import type { z } from 'zod';
import { AuthModule } from '../auth/auth.module.js';
import { EconomyModule } from '../economy/economy.module.js';
import { AuthGuard } from '../auth/guards.js';
import { CurrentUser, ZodPipe, type AuthUser } from '../common/http.js';
import { QuestionsModule } from '../questions/questions.module.js';
import { LIMITS } from '../security/rate-limit.js';
import { UserLimit } from '../security/rate-limit.guards.js';
import { JourneyService } from './journey.service.js';

const RunId = new ParseUUIDPipe({ version: '4' });

@Controller('journey')
@UseGuards(AuthGuard)
export class JourneyController {
  constructor(@Inject(JourneyService) private readonly journey: JourneyService) {}

  /** Mapa do Golem World: o que está aberto, concluído e com quantas estrelas. */
  @Get()
  state(@CurrentUser() user: AuthUser): Promise<JourneyState> {
    return this.journey.state(user.id);
  }

  /** Prepara a fase no idioma do jogador (o app mostra "como jogar" enquanto isso). */
  @Post('prepare')
  @HttpCode(200)
  @UserLimit(LIMITS.prepare)
  prepare(@CurrentUser() user: AuthUser, @Body(new ZodPipe(PrepareNodeRequestSchema)) body: z.infer<typeof PrepareNodeRequestSchema>): Promise<PrepStatus> {
    return this.journey.prepare(user.id, body.nodeId);
  }

  @Post('runs')
  @UserLimit(LIMITS.journeyRun)
  start(@CurrentUser() user: AuthUser, @Body(new ZodPipe(StartRunRequestSchema)) body: z.infer<typeof StartRunRequestSchema>): Promise<JourneyRun> {
    return this.journey.startRun(user.id, body.nodeId);
  }

  @Get('runs/:id')
  run(@CurrentUser() user: AuthUser, @Param('id', RunId) id: string): Promise<JourneyRun> {
    return this.journey.getRun(user.id, id);
  }

  @Post('runs/:id/question')
  @HttpCode(200)
  question(@CurrentUser() user: AuthUser, @Param('id', RunId) id: string): Promise<JourneyQuestion> {
    return this.journey.nextQuestion(user.id, id);
  }

  @Post('runs/:id/answer')
  @HttpCode(200)
  answer(
    @CurrentUser() user: AuthUser,
    @Param('id', RunId) id: string,
    @Body(new ZodPipe(JourneyAnswerRequestSchema)) body: z.infer<typeof JourneyAnswerRequestSchema>,
  ): Promise<JourneyAnswerResult> {
    return this.journey.answer(user.id, id, body.answerId, body.optionIndex);
  }

  @Post('runs/:id/power')
  @HttpCode(200)
  power(
    @CurrentUser() user: AuthUser,
    @Param('id', RunId) id: string,
    @Body(new ZodPipe(PowerUpRequestSchema)) body: z.infer<typeof PowerUpRequestSchema>,
  ): Promise<PowerUpResult> {
    return this.journey.powerUp(user.id, id, body.answerId, body.kind);
  }

  @Post('runs/:id/abandon')
  @HttpCode(200)
  abandon(@CurrentUser() user: AuthUser, @Param('id', RunId) id: string): Promise<JourneyRun> {
    return this.journey.abandon(user.id, id);
  }

  /** Armário do Golem: itens, preços e o que está vestido. */
  @Get('shop')
  shop(@CurrentUser() user: AuthUser): Promise<ShopState> {
    return this.journey.shop(user.id);
  }

  @Post('shop/buy')
  @HttpCode(200)
  @UserLimit(LIMITS.shop)
  buy(@CurrentUser() user: AuthUser, @Body(new ZodPipe(BuyItemRequestSchema)) body: z.infer<typeof BuyItemRequestSchema>): Promise<ShopState> {
    return this.journey.buy(user.id, body.itemId);
  }

  @Post('shop/equip')
  @HttpCode(200)
  @UserLimit(LIMITS.shop)
  equip(@CurrentUser() user: AuthUser, @Body(new ZodPipe(EquipItemRequestSchema)) body: z.infer<typeof EquipItemRequestSchema>): Promise<ShopState> {
    return this.journey.equip(user.id, body.itemId, body.equipped);
  }
}

@Module({
  imports: [AuthModule, QuestionsModule, EconomyModule],
  controllers: [JourneyController],
  providers: [JourneyService],
  exports: [JourneyService],
})
export class JourneyModule {}
