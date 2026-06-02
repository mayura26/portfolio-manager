-- CreateTable
CREATE TABLE "CongressTrade" (
    "id" TEXT NOT NULL,
    "politician" TEXT NOT NULL,
    "stateDist" TEXT,
    "chamber" TEXT NOT NULL DEFAULT 'House',
    "party" TEXT,
    "ticker" TEXT NOT NULL,
    "assetName" TEXT,
    "transaction" TEXT NOT NULL,
    "transactionDate" DATE NOT NULL,
    "reportDate" DATE,
    "rangeRaw" TEXT,
    "amountLow" INTEGER,
    "amountHigh" INTEGER,
    "amountMid" INTEGER,
    "instrumentId" TEXT,
    "sector" TEXT,
    "industry" TEXT,
    "externalKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CongressTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CongressTrade_externalKey_key" ON "CongressTrade"("externalKey");

-- CreateIndex
CREATE INDEX "CongressTrade_ticker_transactionDate_idx" ON "CongressTrade"("ticker", "transactionDate" DESC);

-- CreateIndex
CREATE INDEX "CongressTrade_transactionDate_idx" ON "CongressTrade"("transactionDate" DESC);

-- CreateIndex
CREATE INDEX "CongressTrade_transaction_transactionDate_idx" ON "CongressTrade"("transaction", "transactionDate" DESC);

-- CreateIndex
CREATE INDEX "CongressTrade_sector_transactionDate_idx" ON "CongressTrade"("sector", "transactionDate" DESC);

-- CreateIndex
CREATE INDEX "CongressTrade_instrumentId_idx" ON "CongressTrade"("instrumentId");

-- AddForeignKey
ALTER TABLE "CongressTrade" ADD CONSTRAINT "CongressTrade_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
