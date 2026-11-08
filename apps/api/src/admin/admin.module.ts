import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GameModule } from '../game/game.module.js';
import { AdminApiController, AdminPageController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [AuthModule, GameModule],
  controllers: [AdminPageController, AdminApiController],
  providers: [AdminService],
})
export class AdminModule {}
