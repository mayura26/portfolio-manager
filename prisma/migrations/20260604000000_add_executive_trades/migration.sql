-- CreateTable
CREATE TABLE "ExecutiveTrade" (
    "id" TEXT NOT NULL,
    "filer" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "assetClass" TEXT,
    "transaction" TEXT NOT NULL,
    "transactionDate" DATE,
    "rangeRaw" TEXT,
    "amountLow" INTEGER,
    "amountHigh" INTEGER,
    "amountMid" INTEGER,
    "docId" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutiveTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecutiveTrade_externalKey_key" ON "ExecutiveTrade"("externalKey");

-- CreateIndex
CREATE INDEX "ExecutiveTrade_transactionDate_idx" ON "ExecutiveTrade"("transactionDate" DESC);

-- CreateIndex
CREATE INDEX "ExecutiveTrade_filer_idx" ON "ExecutiveTrade"("filer");
