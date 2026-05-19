-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AUTO_WATCHER';

-- AlterTable
ALTER TABLE "Instrument" ADD COLUMN     "autoWatcherEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoWatcherLastBand" INTEGER,
ADD COLUMN     "autoWatcherLastDailyAt" TIMESTAMP(3),
ADD COLUMN     "autoWatcherThreshold" DECIMAL(8,4) NOT NULL DEFAULT 10;
