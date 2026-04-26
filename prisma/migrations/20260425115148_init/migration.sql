-- CreateEnum
CREATE TYPE "TradeType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('PRICE_ABOVE', 'PRICE_BELOW', 'PCT_CHANGE', 'REVIEW_TIMER', 'ALLOCATION_DRIFT', 'DIVIDEND_EVENT', 'EARNINGS_EVENT');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'TRIGGERED', 'SNOOZED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('HOLD', 'BUY', 'SELL', 'WATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PRICE_ALERT', 'REVIEW_DUE', 'ALLOCATION_DRIFT', 'DIVIDEND_EVENT', 'EARNINGS_EVENT', 'SYSTEM');

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "defaultBaseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pushSubscription" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "yahooSymbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "sector" TEXT,
    "industry" TEXT,
    "instrumentType" TEXT NOT NULL DEFAULT 'EQUITY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "type" "TradeType" NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "price" DECIMAL(18,8) NOT NULL,
    "currency" TEXT NOT NULL,
    "fxRate" DECIMAL(18,8),
    "fees" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" DECIMAL(18,4) NOT NULL,
    "high" DECIMAL(18,4) NOT NULL,
    "low" DECIMAL(18,4) NOT NULL,
    "close" DECIMAL(18,4) NOT NULL,
    "volume" BIGINT,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "portfolioId" TEXT,
    "instrumentId" TEXT,
    "priceTarget" DECIMAL(18,4),
    "priceDirection" TEXT,
    "pctChange" DECIMAL(8,4),
    "referencePrice" DECIMAL(18,4),
    "reviewIntervalDays" INTEGER,
    "lastReviewDate" TIMESTAMP(3),
    "allocationThreshold" DECIMAL(8,4),
    "snoozedUntil" TIMESTAMP(3),
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "triggeredAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "alertId" TEXT,
    "portfolioId" TEXT,
    "instrumentId" TEXT,
    "triggerReason" TEXT NOT NULL,
    "notes" TEXT,
    "action" "ReviewAction",
    "priority" INTEGER NOT NULL DEFAULT 0,
    "decisionDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockNote" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "alertId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Portfolio_createdAt_idx" ON "Portfolio"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_yahooSymbol_key" ON "Instrument"("yahooSymbol");

-- CreateIndex
CREATE INDEX "Instrument_symbol_exchange_idx" ON "Instrument"("symbol", "exchange");

-- CreateIndex
CREATE INDEX "Instrument_yahooSymbol_idx" ON "Instrument"("yahooSymbol");

-- CreateIndex
CREATE INDEX "Trade_portfolioId_date_idx" ON "Trade"("portfolioId", "date");

-- CreateIndex
CREATE INDEX "Trade_instrumentId_date_idx" ON "Trade"("instrumentId", "date");

-- CreateIndex
CREATE INDEX "Trade_portfolioId_instrumentId_idx" ON "Trade"("portfolioId", "instrumentId");

-- CreateIndex
CREATE INDEX "PriceHistory_instrumentId_date_idx" ON "PriceHistory"("instrumentId", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PriceHistory_instrumentId_date_key" ON "PriceHistory"("instrumentId", "date");

-- CreateIndex
CREATE INDEX "FxRate_pair_date_idx" ON "FxRate"("pair", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_pair_date_key" ON "FxRate"("pair", "date");

-- CreateIndex
CREATE INDEX "Alert_status_type_idx" ON "Alert"("status", "type");

-- CreateIndex
CREATE INDEX "Alert_instrumentId_status_idx" ON "Alert"("instrumentId", "status");

-- CreateIndex
CREATE INDEX "Alert_portfolioId_status_idx" ON "Alert"("portfolioId", "status");

-- CreateIndex
CREATE INDEX "Review_status_priority_idx" ON "Review"("status", "priority" DESC);

-- CreateIndex
CREATE INDEX "Review_instrumentId_status_idx" ON "Review"("instrumentId", "status");

-- CreateIndex
CREATE INDEX "Review_portfolioId_status_idx" ON "Review"("portfolioId", "status");

-- CreateIndex
CREATE INDEX "StockNote_instrumentId_updatedAt_idx" ON "StockNote"("instrumentId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_read_dismissed_createdAt_idx" ON "Notification"("read", "dismissed", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_alertId_idx" ON "Notification"("alertId");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockNote" ADD CONSTRAINT "StockNote_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE SET NULL ON UPDATE CASCADE;
