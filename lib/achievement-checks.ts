import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import type { NotificationBatchCandidate } from "@/lib/notification-batching";
import { createBatchedNotifications } from "@/lib/notifications";
import { getPortfolioStats } from "@/lib/stats";

type RecordKey = "portfolio_ath" | "best_day_abs" | "best_day_pct";

type AchievementRecordSnapshot = {
  value: Decimal;
  metadata: Record<string, unknown>;
};

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function metadataObject(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, unknown>;
}

async function getRecord(
  key: RecordKey,
): Promise<AchievementRecordSnapshot | null> {
  const record = await db.achievementRecord.findUnique({ where: { key } });
  return record
    ? {
        value: new Decimal(record.value.toString()),
        metadata: metadataObject(record.metadata),
      }
    : null;
}

async function upsertRecord(
  key: RecordKey,
  value: Decimal,
  achievedAt: Date,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const meta = metadata as object | undefined;
  await db.achievementRecord.upsert({
    where: { key },
    create: { key, value, achievedAt, metadata: meta },
    update: { value, achievedAt, metadata: meta },
  });
}

function shouldNotifyToday(
  prev: AchievementRecordSnapshot | null,
  now: Date,
): boolean {
  return prev?.metadata.lastNotificationDay !== utcDayKey(now);
}

function achievementMetadata(
  prev: AchievementRecordSnapshot | null,
  next: Record<string, unknown>,
  shouldNotify: boolean,
  now: Date,
): Record<string, unknown> {
  return {
    ...(prev?.metadata ?? {}),
    ...next,
    ...(shouldNotify ? { lastNotificationDay: utcDayKey(now) } : {}),
  };
}

export async function checkAndUpdateAchievements(): Promise<{
  updated: string[];
  errors: string[];
}> {
  const updated: string[] = [];
  const errors: string[] = [];
  const notifications: NotificationBatchCandidate[] = [];
  const now = new Date();

  try {
    const stats = await getPortfolioStats();
    const currency = stats.baseCurrency;

    if (stats.allTimeHigh) {
      try {
        const prev = await getRecord("portfolio_ath");
        if (!prev || stats.allTimeHigh.value.gt(prev.value)) {
          const shouldNotify = shouldNotifyToday(prev, now);
          await upsertRecord(
            "portfolio_ath",
            stats.allTimeHigh.value,
            stats.allTimeHigh.date,
            achievementMetadata(prev, { currency }, shouldNotify, now),
          );
          if (shouldNotify) {
            const message = `Your portfolio hit a new record: ${formatCurrency(stats.allTimeHigh.value, currency)} on ${formatDate(stats.allTimeHigh.date)}`;
            notifications.push({
              type: "ACHIEVEMENT",
              groupKey: "achievements",
              title: "New all-time high!",
              message,
              metadata: {
                key: "portfolio_ath",
                value: stats.allTimeHigh.value.toString(),
                currency,
              },
              priority: 2,
              itemLabel: `All-time high: ${formatCurrency(stats.allTimeHigh.value, currency)}`,
              batchLabelSingular: "achievement unlocked",
              batchLabelPlural: "achievements unlocked",
            });
          }
          updated.push("portfolio_ath");
        }
      } catch (err) {
        errors.push(
          `portfolio_ath: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (stats.bestDay?.changeBase.gt(0)) {
      try {
        const prev = await getRecord("best_day_abs");
        if (!prev || stats.bestDay.changeBase.gt(prev.value)) {
          const shouldNotify = shouldNotifyToday(prev, now);
          await upsertRecord(
            "best_day_abs",
            stats.bestDay.changeBase,
            stats.bestDay.date,
            achievementMetadata(
              prev,
              {
                currency,
                pct: stats.bestDay.changePercent.toFixed(2),
              },
              shouldNotify,
              now,
            ),
          );
          if (shouldNotify) {
            const message = `Biggest ever daily gain: +${formatCurrency(stats.bestDay.changeBase, currency)} (${formatPercent(stats.bestDay.changePercent.dividedBy(100), { signed: true })}) on ${formatDate(stats.bestDay.date)}`;
            notifications.push({
              type: "ACHIEVEMENT",
              groupKey: "achievements",
              title: "New best trading day!",
              message,
              metadata: {
                key: "best_day_abs",
                value: stats.bestDay.changeBase.toString(),
                currency,
              },
              priority: 2,
              itemLabel: `Best daily gain: +${formatCurrency(stats.bestDay.changeBase, currency)}`,
              batchLabelSingular: "achievement unlocked",
              batchLabelPlural: "achievements unlocked",
            });
          }
          updated.push("best_day_abs");
        }
      } catch (err) {
        errors.push(
          `best_day_abs: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (stats.bestDay?.changePercent.gt(0)) {
      try {
        const prev = await getRecord("best_day_pct");
        if (!prev || stats.bestDay.changePercent.gt(prev.value)) {
          const shouldNotify = shouldNotifyToday(prev, now);
          await upsertRecord(
            "best_day_pct",
            stats.bestDay.changePercent,
            stats.bestDay.date,
            achievementMetadata(
              prev,
              {
                currency,
                abs: stats.bestDay.changeBase.toFixed(2),
              },
              shouldNotify,
              now,
            ),
          );
          if (shouldNotify) {
            const message = `Biggest ever daily % gain: +${formatPercent(stats.bestDay.changePercent.dividedBy(100), { signed: true })} (${formatCurrency(stats.bestDay.changeBase, currency)}) on ${formatDate(stats.bestDay.date)}`;
            notifications.push({
              type: "ACHIEVEMENT",
              groupKey: "achievements",
              title: "New best trading day!",
              message,
              metadata: {
                key: "best_day_pct",
                value: stats.bestDay.changePercent.toString(),
                currency,
              },
              priority: 2,
              itemLabel: `Best daily % gain: +${formatPercent(stats.bestDay.changePercent.dividedBy(100), { signed: true })}`,
              batchLabelSingular: "achievement unlocked",
              batchLabelPlural: "achievements unlocked",
            });
          }
          updated.push("best_day_pct");
        }
      } catch (err) {
        errors.push(
          `best_day_pct: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    try {
      await createBatchedNotifications(notifications);
    } catch (err) {
      errors.push(
        `notifications: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } catch (err) {
    errors.push(`stats: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { updated, errors };
}
