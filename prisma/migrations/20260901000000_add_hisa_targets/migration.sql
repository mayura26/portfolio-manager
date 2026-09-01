ALTER TABLE "PortfolioGroup"
ADD COLUMN "hisaTargetPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
ADD COLUMN "hisaTargetMinPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
ADD COLUMN "hisaTargetMaxPercent" DECIMAL(8,4) NOT NULL DEFAULT 0;

-- Existing cash target ranges remain pure-cash targets. Existing HISA balances
-- are derived from imported statement metadata and start with an explicit 0%
-- target so users can decide their desired HISA allocation.
