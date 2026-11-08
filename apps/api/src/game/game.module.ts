import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EconomyModule } from '../economy/economy.module.js';
import { QuestionsModule } from '../questions/questions.module.js';
import { BotService } from './bot.service.js';
import { GameController } from './game.controller.js';
import { GameService } from './game.service.js';
import { GamePrepService } from './prep.service.js';
import { QuestionSelector } from './question-selector.service.js';

@Module({
  imports: [AuthModule, QuestionsModule, EconomyModule],
  controllers: [GameController],
  providers: [GameService, QuestionSelector, BotService, GamePrepService],
  exports: [GameService, QuestionSelector, BotService],
})
export class GameModule {}
