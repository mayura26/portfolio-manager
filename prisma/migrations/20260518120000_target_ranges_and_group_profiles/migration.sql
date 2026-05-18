-- Add range-aware allocation targets while preserving existing exact targets
-- as exact min/max bands.

ALTER TABLE "Portfolio"
ADD COLUMN     "targetMinPercentInGroup" DECIMAL(8,4) NOT NULL DEFAULT 0,
ADD COLUMN     "targetMaxPercentInGroup" DECIMAL(8,4) NOT NULL DEFAULT 0;

UPDATE "Portfolio"
SET
  "targetMinPercentInGroup" = "targetPercentInGroup",
  "targetMaxPercentInGroup" = "targetPercentInGroup";

ALTER TABLE "PortfolioGroup"
ADD COLUMN     "cashTargetMinPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
ADD COLUMN     "cashTargetMaxPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
ADD COLUMN     "investmentObjective" TEXT,
ADD COLUMN     "riskTolerance" TEXT,
ADD COLUMN     "timeHorizon" TEXT,
ADD COLUMN     "liquidityNeed" TEXT,
ADD COLUMN     "investmentProfileNotes" TEXT;

UPDATE "PortfolioGroup"
SET
  "cashTargetMinPercent" = "cashTargetPercent",
  "cashTargetMaxPercent" = "cashTargetPercent";

ALTER TABLE "PortfolioTarget"
ADD COLUMN     "targetMinPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
ADD COLUMN     "targetMaxPercent" DECIMAL(8,4) NOT NULL DEFAULT 0;

UPDATE "PortfolioTarget"
SET
  "targetMinPercent" = "targetPercent",
  "targetMaxPercent" = "targetPercent";
