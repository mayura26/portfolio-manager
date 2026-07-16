-- CreateTable
CREATE TABLE "StockSplit" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "exDate" DATE NOT NULL,
    "numerator" DECIMAL(18,8) NOT NULL,
    "denominator" DECIMAL(18,8) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'YAHOO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockSplit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockSplit_instrumentId_exDate_source_key" ON "StockSplit"("instrumentId", "exDate", "source");

-- CreateIndex
CREATE INDEX "StockSplit_instrumentId_exDate_idx" ON "StockSplit"("instrumentId", "exDate");

-- AddForeignKey
ALTER TABLE "StockSplit" ADD CONSTRAINT "StockSplit_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
