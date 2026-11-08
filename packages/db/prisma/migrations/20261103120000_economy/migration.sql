-- Fase 9: economia (shekels e moedas de sabedoria), lojas, ajudas e anúncios com prêmio.

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('coins', 'shekels');

-- CreateEnum
CREATE TYPE "StoreName" AS ENUM ('apple', 'google', 'demo');

-- CreateEnum
CREATE TYPE "BoostKind" AS ENUM ('time', 'skip', 'eliminate');

-- CreateEnum
CREATE TYPE "AdPlacement" AS ENUM ('continue', 'double', 'wheel', 'life', 'boost', 'gift');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "shekels" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "adFree" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "adBreaks" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN "adBreakTarget" SMALLINT NOT NULL DEFAULT 4,
ADD COLUMN "lastAdAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "JourneyRun" ADD COLUMN "revivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "JourneyAnswer" ADD COLUMN "timeAdded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WalletEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reason" VARCHAR(24) NOT NULL,
    "ref" VARCHAR(80),
    "idempotencyKey" VARCHAR(160),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorePurchase" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "store" "StoreName" NOT NULL,
    "productId" VARCHAR(60) NOT NULL,
    "transactionId" VARCHAR(120) NOT NULL,
    "originalId" VARCHAR(120),
    "environment" VARCHAR(20),
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBoost" (
    "userId" UUID NOT NULL,
    "kind" "BoostKind" NOT NULL,
    "count" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "UserBoost_pkey" PRIMARY KEY ("userId","kind")
);

-- CreateTable
CREATE TABLE "RewardTicket" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "placement" "AdPlacement" NOT NULL,
    "ref" VARCHAR(80),
    "prize" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "watchedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "adTransactionId" VARCHAR(160),

    CONSTRAINT "RewardTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_idempotencyKey_key" ON "WalletEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletEntry_userId_createdAt_idx" ON "WalletEntry"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StorePurchase_userId_productId_idx" ON "StorePurchase"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "StorePurchase_store_transactionId_key" ON "StorePurchase"("store", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardTicket_adTransactionId_key" ON "RewardTicket"("adTransactionId");

-- CreateIndex
CREATE INDEX "RewardTicket_userId_placement_watchedAt_idx" ON "RewardTicket"("userId", "placement", "watchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardTicket_userId_placement_ref_key" ON "RewardTicket"("userId", "placement", "ref");

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorePurchase" ADD CONSTRAINT "StorePurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBoost" ADD CONSTRAINT "UserBoost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardTicket" ADD CONSTRAINT "RewardTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrições de integridade (CHECK), que o Prisma não modela.
-- Saldos nunca negativos: a API desconta com condição, e o banco garante de novo.
ALTER TABLE "User" ADD CONSTRAINT "User_shekels_nonnegative" CHECK ("shekels" >= 0);
ALTER TABLE "User" ADD CONSTRAINT "User_adPacing_check" CHECK ("adBreaks" >= 0 AND "adBreakTarget" BETWEEN 1 AND 20);
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_delta_check" CHECK ("delta" <> 0 AND "balance" >= 0);
ALTER TABLE "UserBoost" ADD CONSTRAINT "UserBoost_count_check" CHECK ("count" BETWEEN 0 AND 99);
ALTER TABLE "RewardTicket" ADD CONSTRAINT "RewardTicket_claim_after_watch_check" CHECK ("claimedAt" IS NULL OR "watchedAt" IS NOT NULL);
