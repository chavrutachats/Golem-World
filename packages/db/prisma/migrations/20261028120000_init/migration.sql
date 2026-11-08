-- CreateEnum
CREATE TYPE "Category" AS ENUM ('torah', 'neviim_ketuvim', 'mishnah', 'talmud', 'halakhah', 'midrash_aggadah');

-- CreateEnum
CREATE TYPE "WheelSlice" AS ENUM ('torah', 'neviim_ketuvim', 'mishnah', 'talmud', 'halakhah', 'midrash_aggadah', 'crown');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('easy', 'medium', 'hard', 'expert');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('player', 'reviewer', 'admin');

-- CreateEnum
CREATE TYPE "PassageStatus" AS ENUM ('pending', 'generated', 'skipped', 'failed');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('pending_review', 'approved', 'rejected', 'retired');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('approve', 'reject');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('incorrect', 'ambiguous', 'disrespectful', 'typo', 'other');

-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('solo', 'random', 'friend');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('waiting_opponent', 'active', 'finished', 'abandoned');

-- CreateEnum
CREATE TYPE "PlaySource" AS ENUM ('wheel', 'crown_challenge');

-- CreateTable
CREATE TABLE "SourcePassage" (
    "id" UUID NOT NULL,
    "ref" VARCHAR(160) NOT NULL,
    "category" "Category" NOT NULL,
    "bookTitle" VARCHAR(160) NOT NULL,
    "sefariaPath" TEXT[],
    "heText" TEXT,
    "heVersionTitle" VARCHAR(300),
    "heLicense" VARCHAR(80),
    "enText" TEXT,
    "enVersionTitle" VARCHAR(300),
    "enLicense" VARCHAR(80),
    "commentary" JSONB,
    "contentHash" VARCHAR(64) NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "status" "PassageStatus" NOT NULL DEFAULT 'pending',
    "lastError" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourcePassage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationBatch" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "generatorModel" VARCHAR(120) NOT NULL,
    "verifierModel" VARCHAR(120),
    "promptVersion" VARCHAR(40) NOT NULL,
    "providerBatchId" VARCHAR(200),
    "status" "BatchStatus" NOT NULL DEFAULT 'queued',
    "stats" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GenerationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "passageId" UUID NOT NULL,
    "batchId" UUID,
    "locale" VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
    "category" "Category" NOT NULL,
    "text" VARCHAR(300) NOT NULL,
    "options" TEXT[],
    "correctIndex" SMALLINT NOT NULL,
    "explanation" VARCHAR(600) NOT NULL,
    "sourceRef" VARCHAR(160) NOT NULL,
    "evidenceQuote" VARCHAR(400) NOT NULL,
    "evidenceLanguage" VARCHAR(2) NOT NULL,
    "aiDifficulty" "Difficulty" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "difficultyRationale" VARCHAR(400),
    "status" "QuestionStatus" NOT NULL DEFAULT 'pending_review',
    "validationReport" JSONB,
    "verifierConfidence" DOUBLE PRECISION,
    "dedupeKey" VARCHAR(64) NOT NULL,
    "timesServed" INTEGER NOT NULL DEFAULT 0,
    "timesCorrect" INTEGER NOT NULL DEFAULT 0,
    "lastCalibratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionReview" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "reviewerId" UUID,
    "decision" "ReviewDecision" NOT NULL,
    "notes" VARCHAR(1000),
    "edits" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "displayName" VARCHAR(40) NOT NULL,
    "email" VARCHAR(254),
    "passwordHash" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "role" "UserRole" NOT NULL DEFAULT 'player',
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" UUID NOT NULL,
    "mode" "GameMode" NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'active',
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "maxRounds" INTEGER NOT NULL DEFAULT 25,
    "currentPlayerId" UUID,
    "winnerPlayerId" UUID,
    "inviteCode" VARCHAR(6),
    "turnDeadlineAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePlayer" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "seat" SMALLINT NOT NULL,
    "seals" "Category"[],
    "crownProgress" SMALLINT NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Turn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Spin" (
    "id" UUID NOT NULL,
    "turnId" UUID NOT NULL,
    "result" "WheelSlice" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "Spin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionPlay" (
    "id" UUID NOT NULL,
    "turnId" UUID NOT NULL,
    "spinId" UUID,
    "playerId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "category" "Category" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "source" "PlaySource" NOT NULL DEFAULT 'wheel',
    "optionOrder" SMALLINT[],
    "servedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3),
    "chosenIndex" SMALLINT,
    "isCorrect" BOOLEAN,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuestionPlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionReport" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "playId" UUID,
    "reason" "ReportReason" NOT NULL,
    "comment" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "QuestionReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourcePassage_ref_key" ON "SourcePassage"("ref");

-- CreateIndex
CREATE INDEX "SourcePassage_category_status_idx" ON "SourcePassage"("category", "status");

-- CreateIndex
CREATE INDEX "GenerationBatch_status_idx" ON "GenerationBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Question_dedupeKey_key" ON "Question"("dedupeKey");

-- CreateIndex
CREATE INDEX "Question_status_category_difficulty_idx" ON "Question"("status", "category", "difficulty");

-- CreateIndex
CREATE INDEX "Question_passageId_idx" ON "Question"("passageId");

-- CreateIndex
CREATE INDEX "QuestionReview_questionId_idx" ON "QuestionReview"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_totalPoints_idx" ON "User"("totalPoints" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_inviteCode_key" ON "Game"("inviteCode");

-- CreateIndex
CREATE INDEX "Game_status_mode_idx" ON "Game"("status", "mode");

-- CreateIndex
CREATE INDEX "GamePlayer_userId_idx" ON "GamePlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayer_gameId_userId_key" ON "GamePlayer"("gameId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayer_gameId_seat_key" ON "GamePlayer"("gameId", "seat");

-- CreateIndex
CREATE INDEX "Turn_gameId_roundNumber_idx" ON "Turn"("gameId", "roundNumber");

-- CreateIndex
CREATE INDEX "Spin_turnId_idx" ON "Spin"("turnId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionPlay_spinId_key" ON "QuestionPlay"("spinId");

-- CreateIndex
CREATE INDEX "QuestionPlay_userId_questionId_idx" ON "QuestionPlay"("userId", "questionId");

-- CreateIndex
CREATE INDEX "QuestionPlay_answeredAt_userId_idx" ON "QuestionPlay"("answeredAt", "userId");

-- CreateIndex
CREATE INDEX "QuestionPlay_questionId_idx" ON "QuestionPlay"("questionId");

-- CreateIndex
CREATE INDEX "QuestionReport_questionId_resolvedAt_idx" ON "QuestionReport"("questionId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionReport_userId_questionId_key" ON "QuestionReport"("userId", "questionId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "SourcePassage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "GenerationBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReview" ADD CONSTRAINT "QuestionReview_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReview" ADD CONSTRAINT "QuestionReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "GamePlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spin" ADD CONSTRAINT "Spin_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "Turn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPlay" ADD CONSTRAINT "QuestionPlay_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "Turn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPlay" ADD CONSTRAINT "QuestionPlay_spinId_fkey" FOREIGN KEY ("spinId") REFERENCES "Spin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPlay" ADD CONSTRAINT "QuestionPlay_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "GamePlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPlay" ADD CONSTRAINT "QuestionPlay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPlay" ADD CONSTRAINT "QuestionPlay_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_playId_fkey" FOREIGN KEY ("playId") REFERENCES "QuestionPlay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Restrições de integridade que o Prisma não modela (CHECK).
-- O Prisma ignora CHECK constraints ao comparar o banco com o schema, então
-- elas convivem com `prisma migrate dev` sem gerar drift.
-- -----------------------------------------------------------------------------

-- Toda pergunta tem exatamente 4 alternativas e um gabarito válido.
ALTER TABLE "Question" ADD CONSTRAINT "Question_options_count_check" CHECK (cardinality("options") = 4);
ALTER TABLE "Question" ADD CONSTRAINT "Question_correctIndex_check" CHECK ("correctIndex" BETWEEN 0 AND 3);
ALTER TABLE "Question" ADD CONSTRAINT "Question_evidenceLanguage_check" CHECK ("evidenceLanguage" IN ('he', 'en'));
ALTER TABLE "Question" ADD CONSTRAINT "Question_counters_check" CHECK ("timesServed" >= 0 AND "timesCorrect" BETWEEN 0 AND "timesServed");

-- Passagem precisa ter ao menos um dos idiomas.
ALTER TABLE "SourcePassage" ADD CONSTRAINT "SourcePassage_has_text_check" CHECK ("heText" IS NOT NULL OR "enText" IS NOT NULL);

-- Partida de no máximo 2 jogadores; Coroa vai de 0 a 3.
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_seat_check" CHECK ("seat" IN (0, 1));
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_crownProgress_check" CHECK ("crownProgress" BETWEEN 0 AND 3);
ALTER TABLE "Game" ADD CONSTRAINT "Game_rounds_check" CHECK ("roundNumber" >= 1 AND "maxRounds" >= 1);

-- Cada pergunta servida guarda uma permutação das 4 alternativas.
ALTER TABLE "QuestionPlay" ADD CONSTRAINT "QuestionPlay_optionOrder_check" CHECK (cardinality("optionOrder") = 4);
ALTER TABLE "QuestionPlay" ADD CONSTRAINT "QuestionPlay_chosenIndex_check" CHECK ("chosenIndex" IS NULL OR "chosenIndex" BETWEEN 0 AND 3);
ALTER TABLE "QuestionPlay" ADD CONSTRAINT "QuestionPlay_deadline_check" CHECK ("deadlineAt" > "servedAt");
