-- CreateTable
CREATE TABLE "InsiderTrade" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "insiderName" TEXT NOT NULL,
    "insiderTitle" TEXT,
    "transaction" TEXT NOT NULL,
    "transactionCode" TEXT,
    "transactionDate" DATE NOT NULL,
    "shares" DOUBLE PRECISION,
    "pricePerShare" DOUBLE PRECISION,
    "value" DOUBLE PRECISION,
    "sharesOwnedAfter" DOUBLE PRECISION,
    "accessionNo" TEXT NOT NULL,
    "instrumentId" TEXT,
    "sector" TEXT,
    "industry" TEXT,
    "externalKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsiderTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InsiderTrade_externalKey_key" ON "InsiderTrade"("externalKey");

-- CreateIndex
CREATE INDEX "InsiderTrade_ticker_transactionDate_idx" ON "InsiderTrade"("ticker", "transactionDate" DESC);

-- CreateIndex
CREATE INDEX "InsiderTrade_transactionDate_idx" ON "InsiderTrade"("transactionDate" DESC);

-- CreateIndex
CREATE INDEX "InsiderTrade_transaction_transactionDate_idx" ON "InsiderTrade"("transaction", "transactionDate" DESC);
