-- CreateEnum
CREATE TYPE "CashTransactionType" AS ENUM ('SEED', 'DEPOSIT', 'WITHDRAWAL');

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'FORECAST_DEVIATION';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'FORECAST_DEVIATION';

-- CreateTable
CREATE TABLE "PortfolioGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "cashTargetPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "aiCompositionAnalysis" JSONB,
    "aiCompositionGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortfolioGroup_createdAt_idx" ON "PortfolioGroup"("createdAt");

-- Seed: default group attaches existing portfolios. cashTargetPercent=100 so the
-- group is in a valid sum-to-100 state immediately (all attached portfolios at 0%).
INSERT INTO "PortfolioGroup" ("id", "name", "description", "baseCurrency", "cashTargetPercent", "updatedAt")
VALUES ('default', 'Default', 'Auto-created during the groups/targets/cash migration. Move portfolios into purpose-built groups.', 'USD', 100, CURRENT_TIMESTAMP);

-- AlterTable: Portfolio gains groupId (added nullable, backfilled, then NOT NULL),
-- target weight, and AI composition fields.
ALTER TABLE "Portfolio" ADD COLUMN     "aiCompositionAnalysis" JSONB,
ADD COLUMN     "aiCompositionGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "targetPercentInGroup" DECIMAL(8,4) NOT NULL DEFAULT 0;

-- Backfill all existing portfolios to the default group, then enforce NOT NULL.
UPDATE "Portfolio" SET "groupId" = 'default' WHERE "groupId" IS NULL;
ALTER TABLE "Portfolio" ALTER COLUMN "groupId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "deviationThreshold" DECIMAL(8,4),
ADD COLUMN     "forecastId" TEXT;

-- AlterTable
ALTER TABLE "WatchlistItem" ADD COLUMN     "portfolioId" TEXT;

-- CreateTable
CREATE TABLE "CashTransaction" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "type" "CashTransactionType" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "fxRate" DECIMAL(18,8),
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioTarget" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "targetPercent" DECIMAL(8,4) NOT NULL,
    "intendedBuyPrice" DECIMAL(18,4),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentForecast" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "targetPrice" DECIMAL(18,4) NOT NULL,
    "lowCase" DECIMAL(18,4),
    "highCase" DECIMAL(18,4),
    "expectedReturn" DECIMAL(8,4),
    "horizonMonths" INTEGER NOT NULL DEFAULT 12,
    "rationale" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "reasoningEffort" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstrumentForecast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashTransaction_groupId_date_idx" ON "CashTransaction"("groupId", "date");

-- CreateIndex
CREATE INDEX "PortfolioTarget_portfolioId_idx" ON "PortfolioTarget"("portfolioId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioTarget_portfolioId_instrumentId_key" ON "PortfolioTarget"("portfolioId", "instrumentId");

-- CreateIndex
CREATE INDEX "InstrumentForecast_instrumentId_generatedAt_idx" ON "InstrumentForecast"("instrumentId", "generatedAt" DESC);

-- CreateIndex
CREATE INDEX "Alert_forecastId_idx" ON "Alert"("forecastId");

-- CreateIndex
CREATE INDEX "Portfolio_groupId_idx" ON "Portfolio"("groupId");

-- CreateIndex
CREATE INDEX "WatchlistItem_portfolioId_idx" ON "WatchlistItem"("portfolioId");

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PortfolioGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_forecastId_fkey" FOREIGN KEY ("forecastId") REFERENCES "InstrumentForecast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PortfolioGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioTarget" ADD CONSTRAINT "PortfolioTarget_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioTarget" ADD CONSTRAINT "PortfolioTarget_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentForecast" ADD CONSTRAINT "InstrumentForecast_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
