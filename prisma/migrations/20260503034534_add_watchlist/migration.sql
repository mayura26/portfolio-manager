-- CreateEnum
CREATE TYPE "WatchlistStatus" AS ENUM ('WATCHING', 'ARCHIVED', 'BOUGHT');

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "status" "WatchlistStatus" NOT NULL DEFAULT 'WATCHING',
    "buyRangeLow" DECIMAL(18,4),
    "buyRangeHigh" DECIMAL(18,4),
    "aiAnalysis" JSONB,
    "alertId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_alertId_key" ON "WatchlistItem"("alertId");

-- CreateIndex
CREATE INDEX "WatchlistItem_status_createdAt_idx" ON "WatchlistItem"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_instrumentId_key" ON "WatchlistItem"("instrumentId");

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE SET NULL ON UPDATE CASCADE;
