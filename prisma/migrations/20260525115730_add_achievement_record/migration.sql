-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ACHIEVEMENT';

-- CreateTable
CREATE TABLE "AchievementRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AchievementRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AchievementRecord_key_key" ON "AchievementRecord"("key");
