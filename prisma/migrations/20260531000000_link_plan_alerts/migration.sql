-- AlterTable
-- Link auto-created price alerts back to the PortfolioTarget plan level that
-- spawned them, so buy/sell levels can keep a matching alert in sync (and
-- cascade-delete it when the target is removed).
ALTER TABLE "Alert" ADD COLUMN "portfolioTargetId" TEXT;

-- CreateIndex
CREATE INDEX "Alert_portfolioTargetId_idx" ON "Alert"("portfolioTargetId");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_portfolioTargetId_fkey"
  FOREIGN KEY ("portfolioTargetId") REFERENCES "PortfolioTarget"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
