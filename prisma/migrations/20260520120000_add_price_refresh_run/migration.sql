-- CreateTable
CREATE TABLE "PriceRefreshRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "instruments" INTEGER NOT NULL DEFAULT 0,
    "bars" INTEGER NOT NULL DEFAULT 0,
    "failures" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'cron',

    CONSTRAINT "PriceRefreshRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceRefreshRun_startedAt_idx" ON "PriceRefreshRun"("startedAt" DESC);
