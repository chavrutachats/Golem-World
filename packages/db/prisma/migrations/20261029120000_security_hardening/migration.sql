-- Fase 5: endurecimento de segurança.
-- Sessões revogáveis (sessionVersion), exclusão de conta (deletedAt), denúncias com
-- confiança e disjuntor, e quem resolveu cada denúncia.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "registeredAt" TIMESTAMP(3),
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "QuestionReport" ADD COLUMN     "resolution" VARCHAR(20),
ADD COLUMN     "resolvedById" UUID,
ADD COLUMN     "triggeredRetirement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trusted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "revokedReason" VARCHAR(20);

-- CreateIndex
CREATE INDEX "User_isGuest_createdAt_idx" ON "User"("isGuest", "createdAt");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "QuestionReport_userId_createdAt_idx" ON "QuestionReport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionReport_triggeredRetirement_createdAt_idx" ON "QuestionReport"("triggeredRetirement", "createdAt");

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Contas cadastradas antes desta migration: a data de cadastro é a de criação.
UPDATE "User" SET "registeredAt" = "createdAt" WHERE "isGuest" = false AND "registeredAt" IS NULL;

-- -----------------------------------------------------------------------------
-- Restrições de integridade (CHECK), que o Prisma não modela.
-- -----------------------------------------------------------------------------

-- Conta excluída não guarda e-mail nem senha.
ALTER TABLE "User" ADD CONSTRAINT "User_deleted_has_no_credentials_check"
  CHECK ("deletedAt" IS NULL OR ("email" IS NULL AND "passwordHash" IS NULL));
ALTER TABLE "User" ADD CONSTRAINT "User_sessionVersion_check" CHECK ("sessionVersion" >= 0);
-- Conta cadastrada (com e-mail) tem data de cadastro.
ALTER TABLE "User" ADD CONSTRAINT "User_registered_has_date_check" CHECK ("email" IS NULL OR "registeredAt" IS NOT NULL);

-- Tokens revogados antes desta migration vieram de renovação ou logout; "rotated" é o
-- valor conservador (reuso continua sendo tratado como vazamento).
UPDATE "RefreshToken" SET "revokedReason" = 'rotated' WHERE "revokedAt" IS NOT NULL;

-- Motivo de revogação só com os valores conhecidos, e sempre junto da data.
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_revokedReason_check"
  CHECK (("revokedReason" IS NULL AND "revokedAt" IS NULL) OR ("revokedReason" IN ('rotated', 'grace', 'logout', 'limit', 'all') AND "revokedAt" IS NOT NULL));

-- Resolução de denúncia só com um dos três desfechos, e sempre junto da data.
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_resolution_check"
  CHECK ("resolution" IS NULL OR "resolution" IN ('dismiss', 'retire', 'restore'));
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_resolution_date_check"
  CHECK ("resolution" IS NULL OR "resolvedAt" IS NOT NULL);
