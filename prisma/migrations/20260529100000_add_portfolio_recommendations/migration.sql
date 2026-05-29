CREATE TYPE "PortfolioRecommendationAction" AS ENUM ('BUY', 'SELL', 'TRIM');

CREATE TYPE "PortfolioRecommendationSource" AS ENUM ('MANUAL', 'AI');

ALTER TABLE "PortfolioTarget"
  ADD COLUMN "recommendationAction" "PortfolioRecommendationAction",
  ADD COLUMN "recommendationSource" "PortfolioRecommendationSource",
  ADD COLUMN "recommendationRationale" TEXT,
  ADD COLUMN "recommendationGeneratedAt" TIMESTAMP(3),
  ADD COLUMN "recommendationModel" TEXT,
  ADD COLUMN "recommendationReasoningEffort" TEXT;
