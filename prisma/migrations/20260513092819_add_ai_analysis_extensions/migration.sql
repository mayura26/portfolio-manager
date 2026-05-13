-- CreateEnum
CREATE TYPE "ForecastSource" AS ENUM ('AI', 'USER');

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'TARGET_HIT';

-- AlterTable
ALTER TABLE "InstrumentForecast" ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" "ForecastSource" NOT NULL DEFAULT 'AI',
ADD COLUMN     "streetNumberOfAnalysts" INTEGER,
ADD COLUMN     "streetRecommendation" TEXT,
ADD COLUMN     "streetTargetHigh" DECIMAL(18,4),
ADD COLUMN     "streetTargetLow" DECIMAL(18,4),
ADD COLUMN     "streetTargetMean" DECIMAL(18,4);

-- AlterTable
ALTER TABLE "PortfolioTarget" ADD COLUMN     "intendedSellPrice" DECIMAL(18,4),
ADD COLUMN     "trimAtGainPercent" DECIMAL(8,4);

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "pinUserForecastsByDefault" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sellSignalGainPercent" DECIMAL(8,4) NOT NULL DEFAULT 25;

-- CreateTable
CREATE TABLE "InstrumentForecastDocument" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "extractedText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstrumentForecastDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstrumentForecastDocument_instrumentId_createdAt_idx" ON "InstrumentForecastDocument"("instrumentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "InstrumentForecast_instrumentId_source_generatedAt_idx" ON "InstrumentForecast"("instrumentId", "source", "generatedAt" DESC);

-- CreateIndex
CREATE INDEX "InstrumentForecast_instrumentId_isPinned_idx" ON "InstrumentForecast"("instrumentId", "isPinned");

-- AddForeignKey
ALTER TABLE "InstrumentForecast" ADD CONSTRAINT "InstrumentForecast_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InstrumentForecastDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
