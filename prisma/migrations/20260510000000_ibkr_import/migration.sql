-- AlterEnum
ALTER TYPE "CashTransactionType" ADD VALUE 'DIVIDEND';

-- AlterTable: Trade — externalRef for IBKR import deduplication
ALTER TABLE "Trade" ADD COLUMN "externalRef" TEXT;

-- CreateIndex: prevent duplicate trades per portfolio/externalRef
CREATE UNIQUE INDEX "Trade_portfolioId_externalRef_key" ON "Trade"("portfolioId", "externalRef");

-- AlterTable: PortfolioGroup — IBKR Flex credentials per group
ALTER TABLE "PortfolioGroup" ADD COLUMN "ibkrFlexToken" TEXT;
ALTER TABLE "PortfolioGroup" ADD COLUMN "ibkrFlexQueryId" TEXT;

-- AlterTable: CashTransaction — externalRef for IBKR cash deduplication
ALTER TABLE "CashTransaction" ADD COLUMN "externalRef" TEXT;

-- CreateIndex: prevent duplicate cash transactions per group/externalRef
CREATE UNIQUE INDEX "CashTransaction_groupId_externalRef_key" ON "CashTransaction"("groupId", "externalRef");
