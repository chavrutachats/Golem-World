-- Fase 2: versões em português do Sefaria, segmentos e ordem das passagens, lotes assíncronos.

-- AlterEnum
ALTER TYPE "PassageStatus" ADD VALUE 'in_batch';

-- AlterTable
ALTER TABLE "SourcePassage" ADD COLUMN     "lastBatchId" UUID,
ADD COLUMN     "ptLicense" VARCHAR(80),
ADD COLUMN     "ptText" TEXT,
ADD COLUMN     "ptVersionTitle" VARCHAR(300),
ADD COLUMN     "section" VARCHAR(20) NOT NULL DEFAULT '',
ADD COLUMN     "segments" JSONB,
ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "SourcePassage_bookTitle_sequence_idx" ON "SourcePassage"("bookTitle", "sequence");

-- Restrições (CHECK) atualizadas para o português.
ALTER TABLE "Question" DROP CONSTRAINT "Question_evidenceLanguage_check";
ALTER TABLE "Question" ADD CONSTRAINT "Question_evidenceLanguage_check" CHECK ("evidenceLanguage" IN ('he', 'en', 'pt'));

ALTER TABLE "SourcePassage" DROP CONSTRAINT "SourcePassage_has_text_check";
ALTER TABLE "SourcePassage" ADD CONSTRAINT "SourcePassage_has_text_check" CHECK ("heText" IS NOT NULL OR "enText" IS NOT NULL OR "ptText" IS NOT NULL);
