-- CreateTable
CREATE TABLE "CronJobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "warnings" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "error" TEXT,

    CONSTRAINT "CronJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CronJobRun_job_startedAt_idx" ON "CronJobRun"("job", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "CronJobRun_startedAt_idx" ON "CronJobRun"("startedAt" DESC);
