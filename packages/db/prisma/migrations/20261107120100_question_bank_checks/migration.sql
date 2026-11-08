-- Fase 12: as perguntas do banco citam o Sefaria pela referência e guardam o trecho (evidência,
-- versão e licença) na própria linha; não dependem de SourcePassage nem de StudyText.
-- (Separado da migration anterior: um valor novo de enum só pode ser usado depois do commit.)
ALTER TABLE "Question" DROP CONSTRAINT "Question_has_source";
ALTER TABLE "Question" ADD CONSTRAINT "Question_has_source"
  CHECK ("passageId" IS NOT NULL OR "studyTextId" IS NOT NULL OR ("origin" = 'bank' AND "versionTitle" IS NOT NULL AND "license" IS NOT NULL));

ALTER TABLE "Question" DROP CONSTRAINT "Question_template_has_study_text";
ALTER TABLE "Question" ADD CONSTRAINT "Question_template_has_study_text"
  CHECK ("origin" <> 'template' OR ("studyTextId" IS NOT NULL AND "template" IS NOT NULL));
