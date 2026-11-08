-- Fase 7: Golem World (trilhas, fases, itens), perguntas de molde, vidas e bots na roleta.

-- CreateEnum
CREATE TYPE "JourneyTrack" AS ENUM ('torah', 'mishnah', 'talmud', 'midrash', 'commentators', 'kabbalah', 'mitzvot');

-- CreateEnum
CREATE TYPE "QuestionOrigin" AS ENUM ('llm', 'template');

-- CreateEnum
CREATE TYPE "JourneyRunStatus" AS ENUM ('active', 'completed', 'failed', 'abandoned');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "contextLabel" VARCHAR(160),
ADD COLUMN     "contextLanguage" VARCHAR(2),
ADD COLUMN     "contextText" VARCHAR(2000),
ADD COLUMN     "license" VARCHAR(80),
ADD COLUMN     "origin" "QuestionOrigin" NOT NULL DEFAULT 'llm',
ADD COLUMN     "parashot" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "studyTextId" UUID,
ADD COLUMN     "template" VARCHAR(40),
ADD COLUMN     "track" "JourneyTrack",
ADD COLUMN     "versionTitle" VARCHAR(300),
ALTER COLUMN "passageId" DROP NOT NULL,
ALTER COLUMN "category" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "coins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isBot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "journeySkill" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
ADD COLUMN     "lives" SMALLINT NOT NULL DEFAULT 5,
ADD COLUMN     "livesUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "StudyText" (
    "id" UUID NOT NULL,
    "ref" VARCHAR(200) NOT NULL,
    "track" "JourneyTrack" NOT NULL,
    "bookTitle" VARCHAR(200) NOT NULL,
    "author" VARCHAR(80),
    "sequence" INTEGER NOT NULL,
    "heText" TEXT,
    "heVersionTitle" VARCHAR(300),
    "heLicense" VARCHAR(80),
    "enText" TEXT,
    "enVersionTitle" VARCHAR(300),
    "enLicense" VARCHAR(80),
    "ptText" TEXT,
    "ptVersionTitle" VARCHAR(300),
    "ptLicense" VARCHAR(80),
    "anchors" TEXT[],
    "parashot" TEXT[],
    "wordCount" INTEGER NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyProgress" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "nodeId" VARCHAR(60) NOT NULL,
    "bestStars" SMALLINT NOT NULL,
    "completions" INTEGER NOT NULL DEFAULT 1,
    "firstCompletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCompletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyRun" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "nodeId" VARCHAR(60) NOT NULL,
    "status" "JourneyRunStatus" NOT NULL DEFAULT 'active',
    "hearts" SMALLINT NOT NULL,
    "maxHearts" SMALLINT NOT NULL,
    "heartsLost" SMALLINT NOT NULL DEFAULT 0,
    "obstacleIndex" SMALLINT NOT NULL DEFAULT 0,
    "obstacleCount" SMALLINT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "timeLimitSec" SMALLINT NOT NULL,
    "coinBonusPct" SMALLINT NOT NULL DEFAULT 0,
    "forgiveLeft" SMALLINT NOT NULL DEFAULT 0,
    "eliminateLeft" SMALLINT NOT NULL DEFAULT 0,
    "skipLeft" SMALLINT NOT NULL DEFAULT 0,
    "hintLeft" SMALLINT NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "JourneyRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyAnswer" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "obstacleIndex" SMALLINT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "optionOrder" SMALLINT[],
    "eliminated" SMALLINT[] DEFAULT ARRAY[]::SMALLINT[],
    "hintUsed" BOOLEAN NOT NULL DEFAULT false,
    "servedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3),
    "chosenIndex" SMALLINT,
    "isCorrect" BOOLEAN,
    "outcome" VARCHAR(10),
    "coins" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JourneyAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "itemId" VARCHAR(40) NOT NULL,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudyText_ref_key" ON "StudyText"("ref");

-- CreateIndex
CREATE INDEX "StudyText_track_bookTitle_sequence_idx" ON "StudyText"("track", "bookTitle", "sequence");

-- CreateIndex
CREATE INDEX "StudyText_parashot_idx" ON "StudyText" USING GIN ("parashot");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyProgress_userId_nodeId_key" ON "JourneyProgress"("userId", "nodeId");

-- CreateIndex
CREATE INDEX "JourneyRun_userId_status_idx" ON "JourneyRun"("userId", "status");

-- CreateIndex
CREATE INDEX "JourneyAnswer_runId_idx" ON "JourneyAnswer"("runId");

-- CreateIndex
CREATE INDEX "JourneyAnswer_userId_questionId_idx" ON "JourneyAnswer"("userId", "questionId");

-- CreateIndex
CREATE INDEX "JourneyAnswer_questionId_idx" ON "JourneyAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserItem_userId_itemId_key" ON "UserItem"("userId", "itemId");

-- CreateIndex
CREATE INDEX "Question_studyTextId_idx" ON "Question"("studyTextId");

-- CreateIndex
CREATE INDEX "Question_track_status_difficulty_idx" ON "Question"("track", "status", "difficulty");

-- CreateIndex
CREATE INDEX "Question_parashot_idx" ON "Question" USING GIN ("parashot");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_studyTextId_fkey" FOREIGN KEY ("studyTextId") REFERENCES "StudyText"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyProgress" ADD CONSTRAINT "JourneyProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyRun" ADD CONSTRAINT "JourneyRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyAnswer" ADD CONSTRAINT "JourneyAnswer_runId_fkey" FOREIGN KEY ("runId") REFERENCES "JourneyRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyAnswer" ADD CONSTRAINT "JourneyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserItem" ADD CONSTRAINT "UserItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o banco garante (além do Prisma) ------------------------------

-- Toda pergunta aponta para o texto de onde saiu.
ALTER TABLE "Question" ADD CONSTRAINT "Question_has_source"
  CHECK ("passageId" IS NOT NULL OR "studyTextId" IS NOT NULL);
-- Pergunta de molde só existe sobre um texto de estudo.
ALTER TABLE "Question" ADD CONSTRAINT "Question_template_has_study_text"
  CHECK ("origin" = 'llm' OR ("studyTextId" IS NOT NULL AND "template" IS NOT NULL));
-- Sem categoria da roleta, a pergunta precisa de uma trilha do Golem World.
ALTER TABLE "Question" ADD CONSTRAINT "Question_has_category_or_track"
  CHECK ("category" IS NOT NULL OR "track" IS NOT NULL);

ALTER TABLE "User" ADD CONSTRAINT "User_lives_range" CHECK ("lives" >= 0 AND "lives" <= 5);
ALTER TABLE "User" ADD CONSTRAINT "User_coins_nonnegative" CHECK ("coins" >= 0);
ALTER TABLE "User" ADD CONSTRAINT "User_journeySkill_range" CHECK ("journeySkill" >= 0 AND "journeySkill" <= 3);
-- Bot nunca tem login.
ALTER TABLE "User" ADD CONSTRAINT "User_bot_without_login"
  CHECK (NOT "isBot" OR ("email" IS NULL AND "passwordHash" IS NULL));

ALTER TABLE "JourneyRun" ADD CONSTRAINT "JourneyRun_hearts_range"
  CHECK ("hearts" >= 0 AND "hearts" <= "maxHearts");
ALTER TABLE "JourneyRun" ADD CONSTRAINT "JourneyRun_obstacles_range"
  CHECK ("obstacleIndex" >= 0 AND "obstacleIndex" <= "obstacleCount");
ALTER TABLE "JourneyRun" ADD CONSTRAINT "JourneyRun_powerups_nonnegative"
  CHECK ("forgiveLeft" >= 0 AND "eliminateLeft" >= 0 AND "skipLeft" >= 0 AND "hintLeft" >= 0 AND "coins" >= 0);
ALTER TABLE "JourneyProgress" ADD CONSTRAINT "JourneyProgress_stars_range" CHECK ("bestStars" BETWEEN 1 AND 3);

-- Uma fase em andamento por jogador.
CREATE UNIQUE INDEX "JourneyRun_one_active_per_user" ON "JourneyRun"("userId") WHERE "status" = 'active';
-- Um só item vestido por espaço é garantido pela API; aqui, no máximo um registro por item.
