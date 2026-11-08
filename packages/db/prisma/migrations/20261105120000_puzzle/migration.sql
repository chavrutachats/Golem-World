-- Fase 11: "Pedras do Choshen", o match-3 do Golem World.

-- AlterEnum (anúncio com prêmio "+5 jogadas")
ALTER TYPE "AdPlacement" ADD VALUE 'moves';

-- CreateEnum
CREATE TYPE "PuzzleRunStatus" AS ENUM ('playing', 'won', 'lost', 'abandoned');

-- CreateTable
CREATE TABLE "PuzzleRun" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "level" SMALLINT NOT NULL,
    "seed" INTEGER NOT NULL,
    "status" "PuzzleRunStatus" NOT NULL DEFAULT 'playing',
    "extraMoves" SMALLINT NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "stars" SMALLINT NOT NULL DEFAULT 0,
    "movesUsed" SMALLINT NOT NULL DEFAULT 0,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "PuzzleRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PuzzleRun_level_check" CHECK ("level" BETWEEN 1 AND 60),
    CONSTRAINT "PuzzleRun_seed_check" CHECK ("seed" > 0),
    CONSTRAINT "PuzzleRun_stars_check" CHECK ("stars" BETWEEN 0 AND 3),
    CONSTRAINT "PuzzleRun_counts_check" CHECK ("extraMoves" >= 0 AND "score" >= 0 AND "movesUsed" >= 0 AND "coins" >= 0),
    CONSTRAINT "PuzzleRun_ended_check" CHECK (("status" = 'playing') = ("endedAt" IS NULL))
);

-- CreateIndex
CREATE INDEX "PuzzleRun_userId_level_stars_idx" ON "PuzzleRun"("userId", "level", "stars");

-- CreateIndex
CREATE INDEX "PuzzleRun_userId_status_idx" ON "PuzzleRun"("userId", "status");

-- AddForeignKey
ALTER TABLE "PuzzleRun" ADD CONSTRAINT "PuzzleRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
