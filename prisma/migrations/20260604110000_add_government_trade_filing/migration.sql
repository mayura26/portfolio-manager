-- CreateTable
CREATE TABLE "GovernmentTradeFiling" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "filer" TEXT,
    "filedAt" DATE,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovernmentTradeFiling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GovernmentTradeFiling_source_docId_key" ON "GovernmentTradeFiling"("source", "docId");

-- CreateIndex
CREATE INDEX "GovernmentTradeFiling_source_processedAt_idx" ON "GovernmentTradeFiling"("source", "processedAt" DESC);

-- CreateIndex
CREATE INDEX "GovernmentTradeFiling_filedAt_idx" ON "GovernmentTradeFiling"("filedAt" DESC);
