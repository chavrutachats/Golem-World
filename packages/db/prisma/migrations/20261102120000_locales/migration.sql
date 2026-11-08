-- Fase 8: idiomas (pt, en, he) e traduções automáticas guardadas no servidor.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "locale" VARCHAR(2) NOT NULL DEFAULT 'pt';

-- AlterTable: as perguntas antigas usavam "pt-BR".
ALTER TABLE "Question" ALTER COLUMN "locale" SET DEFAULT 'pt',
ADD COLUMN "machineTranslated" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Question" SET "locale" = 'pt' WHERE "locale" IN ('pt-BR', 'pt_BR');

-- As perguntas de molde antigas eram montadas em português com trechos em inglês ou
-- hebraico; saem de circulação (as novas são montadas inteiras no idioma do jogador).
-- Continuam no banco para não quebrar o histórico de partidas.
UPDATE "Question" SET "status" = 'retired'
WHERE "origin" = 'template' AND "status" = 'approved'
  AND ("contextLanguage" IN ('en', 'he') OR "evidenceLanguage" IN ('en', 'he'));

-- CreateIndex
CREATE INDEX "Question_status_locale_category_idx" ON "Question"("status", "locale", "category");

-- CreateTable
CREATE TABLE "SegmentTranslation" (
    "id" UUID NOT NULL,
    "studyTextId" UUID NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "text" TEXT NOT NULL,
    "sourceHash" VARCHAR(64) NOT NULL,
    "license" VARCHAR(80),
    "provider" VARCHAR(40) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "promptVersion" VARCHAR(40) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'machine',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SegmentTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionTranslation" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "text" VARCHAR(300) NOT NULL,
    "options" TEXT[],
    "explanation" VARCHAR(600) NOT NULL,
    "evidenceQuote" VARCHAR(400) NOT NULL,
    "contextLabel" VARCHAR(160),
    "contextText" VARCHAR(2000),
    "sourceHash" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "promptVersion" VARCHAR(40) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'machine',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SegmentTranslation_studyTextId_locale_key" ON "SegmentTranslation"("studyTextId", "locale");
CREATE INDEX "SegmentTranslation_locale_idx" ON "SegmentTranslation"("locale");
CREATE UNIQUE INDEX "QuestionTranslation_questionId_locale_key" ON "QuestionTranslation"("questionId", "locale");
CREATE INDEX "QuestionTranslation_locale_idx" ON "QuestionTranslation"("locale");

-- AddForeignKey
ALTER TABLE "SegmentTranslation" ADD CONSTRAINT "SegmentTranslation_studyTextId_fkey" FOREIGN KEY ("studyTextId") REFERENCES "StudyText"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionTranslation" ADD CONSTRAINT "QuestionTranslation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bots não leem as perguntas: jogam no original hebraico, que existe para todos os textos.
UPDATE "User" SET "locale" = 'he' WHERE "isBot" = true;
