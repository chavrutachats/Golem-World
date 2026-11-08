-- Fase 12: banco de perguntas trilíngue.
ALTER TYPE "QuestionOrigin" ADD VALUE 'bank';

ALTER TABLE "QuestionTranslation"
  ADD COLUMN "evidenceLanguage" VARCHAR(2),
  ADD COLUMN "contextLanguage" VARCHAR(2),
  ADD COLUMN "versionTitle" VARCHAR(300),
  ADD COLUMN "license" VARCHAR(80);
