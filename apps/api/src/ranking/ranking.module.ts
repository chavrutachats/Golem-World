import { Controller, Get, Inject, Injectable, Module, Query, UseGuards } from '@nestjs/common';
import type { PrismaClient } from '@trivia/db';
import { RankingPeriodSchema, type RankingEntry, type RankingPeriod } from '@trivia/shared';
import { z } from 'zod';
import { AuthModule } from '../auth/auth.module.js';
import { AuthGuard } from '../auth/guards.js';
import { CurrentUser, ZodPipe, type AuthUser } from '../common/http.js';
import { CLOCK, PRISMA, type Clock } from '../common/infra.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { startOfWeek } from './week.js';

const RankingQuerySchema = z.object({
  period: RankingPeriodSchema.default('week'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

interface Row {
  userId: string;
  displayName: string;
  points: number;
  position: number;
}

@Injectable()
export class RankingService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async rows(period: RankingPeriod, limit: number, onlyUserId?: string): Promise<Row[]> {
    if (period === 'all') {
      return this.prisma.$queryRaw<Row[]>`
        SELECT * FROM (
          SELECT u.id AS "userId", u."displayName", u."totalPoints" AS points,
                 RANK() OVER (ORDER BY u."totalPoints" DESC)::int AS position
          FROM "User" u WHERE u."totalPoints" > 0 AND u."deletedAt" IS NULL AND NOT u."isBot"
        ) r
        WHERE ${onlyUserId ?? null}::uuid IS NULL OR r."userId" = ${onlyUserId ?? null}::uuid
        ORDER BY r.position, r."displayName"
        LIMIT ${limit}`;
    }
    const since = startOfWeek(this.clock.now(), this.config.rankingTimeZone);
    return this.prisma.$queryRaw<Row[]>`
      SELECT * FROM (
        SELECT t."userId", u."displayName", t.points,
               RANK() OVER (ORDER BY t.points DESC)::int AS position
        FROM (
          SELECT qp."userId", SUM(qp."pointsAwarded")::int AS points
          FROM "QuestionPlay" qp
          WHERE qp."answeredAt" >= ${since}
          GROUP BY qp."userId"
          HAVING SUM(qp."pointsAwarded") > 0
        ) t JOIN "User" u ON u.id = t."userId" AND u."deletedAt" IS NULL AND NOT u."isBot"
      ) r
      WHERE ${onlyUserId ?? null}::uuid IS NULL OR r."userId" = ${onlyUserId ?? null}::uuid
      ORDER BY r.position, r."displayName"
      LIMIT ${limit}`;
  }

  async ranking(userId: string, period: RankingPeriod, limit: number) {
    const [entries, mine] = await Promise.all([this.rows(period, limit), this.rows(period, 1, userId)]);
    const toEntry = (r: Row): RankingEntry => ({
      position: Number(r.position),
      userId: r.userId,
      displayName: r.displayName,
      points: Number(r.points),
    });
    return { period, entries: entries.map(toEntry), me: mine[0] ? toEntry(mine[0]) : null };
  }
}

@Controller('ranking')
@UseGuards(AuthGuard)
export class RankingController {
  constructor(@Inject(RankingService) private readonly service: RankingService) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @Query(new ZodPipe(RankingQuerySchema)) query: z.infer<typeof RankingQuerySchema>) {
    return this.service.ranking(user.id, query.period, query.limit);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [RankingController],
  providers: [RankingService],
})
export class RankingModule {}
