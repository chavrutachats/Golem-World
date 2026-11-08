import { Controller, Get, Global, Inject, Module, type DynamicModule } from '@nestjs/common';
import type { PrismaClient } from '@trivia/db';
import { AccountModule } from './account/account.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { EconomyModule } from './economy/economy.module.js';
import { InfraModule, PRISMA } from './common/infra.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { GameModule } from './game/game.module.js';
import { JourneyModule } from './journey/journey.module.js';
import { PuzzleModule } from './puzzle/puzzle.module.js';
import { ReportsModule } from './questions/reports.module.js';
import { RankingModule } from './ranking/ranking.module.js';
import { SecurityModule } from './security/security.module.js';
import { TranslationModule } from './translation/translation.module.js';

@Controller('health')
class HealthController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}

@Global()
@Module({})
class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return { module: ConfigModule, providers: [{ provide: APP_CONFIG, useValue: config }], exports: [APP_CONFIG] };
  }
}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(config), InfraModule, TranslationModule, SecurityModule, AuthModule, GameModule, JourneyModule, EconomyModule, PuzzleModule, RankingModule, ReportsModule, AdminModule, AccountModule],
      controllers: [HealthController],
    };
  }
}
