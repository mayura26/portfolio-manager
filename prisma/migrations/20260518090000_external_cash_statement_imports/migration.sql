-- CreateEnum
CREATE TYPE "CashTransactionSource" AS ENUM ('MANUAL', 'IBKR', 'EXTERNAL_STATEMENT');

-- CreateTable
CREATE TABLE "CashStatementImport" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "sourceAccountKey" TEXT NOT NULL,
    "accountType" TEXT,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "statementGeneratedAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "endingBalance" DECIMAL(18,4) NOT NULL,
    "filename" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "importInserted" INTEGER NOT NULL DEFAULT 0,
    "importSkipped" INTEGER NOT NULL DEFAULT 0,
    "reconciliationDelta" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashStatementImport_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CashTransaction" ADD COLUMN "source" "CashTransactionSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "CashTransaction" ADD COLUMN "sourceAccountKey" TEXT;
ALTER TABLE "CashTransaction" ADD COLUMN "statementImportId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CashStatementImport_groupId_fileHash_key" ON "CashStatementImport"("groupId", "fileHash");

-- CreateIndex
CREATE INDEX "CashStatementImport_groupId_createdAt_idx" ON "CashStatementImport"("groupId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CashStatementImport_groupId_sourceAccountKey_periodEnd_idx" ON "CashStatementImport"("groupId", "sourceAccountKey", "periodEnd");

-- CreateIndex
CREATE INDEX "CashTransaction_groupId_source_sourceAccountKey_date_idx" ON "CashTransaction"("groupId", "source", "sourceAccountKey", "date");

-- CreateIndex
CREATE INDEX "CashTransaction_statementImportId_idx" ON "CashTransaction"("statementImportId");

-- AddForeignKey
ALTER TABLE "CashStatementImport" ADD CONSTRAINT "CashStatementImport_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PortfolioGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_statementImportId_fkey" FOREIGN KEY ("statementImportId") REFERENCES "CashStatementImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
