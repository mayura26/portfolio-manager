-- CreateTable
CREATE TABLE "IbkrSyncRun" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "cashInserted" INTEGER NOT NULL DEFAULT 0,
    "cashSkipped" INTEGER NOT NULL DEFAULT 0,
    "failedSymbols" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'cron',

    CONSTRAINT "IbkrSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IbkrSyncRun_groupId_startedAt_idx" ON "IbkrSyncRun"("groupId", "startedAt" DESC);

-- AddForeignKey
ALTER TABLE "IbkrSyncRun" ADD CONSTRAINT "IbkrSyncRun_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PortfolioGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
