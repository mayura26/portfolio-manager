import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { getPortfolioStats } from "@/lib/stats";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import Decimal from "decimal.js";

type RecordKey = "portfolio_ath" | "best_day_abs" | "best_day_pct";

async function getRecord(key: RecordKey): Promise<Decimal | null> {
  const record = await db.achievementRecord.findUnique({ where: { key } });
  return record ? new Decimal(record.value.toString()) : null;
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

export async function checkAndUpdateAchievements(): Promise<{
  updated: string[];
  errors: string[];
}> {
  const updated: string[] = [];
  const errors: string[] = [];

  try {
    const stats = await getPortfolioStats();
    const currency = stats.baseCurrency;

    // ── All-time portfolio high ────────────────────────────────────────────
    if (stats.allTimeHigh) {
      try {
        const prev = await getRecord("portfolio_ath");
        if (!prev || stats.allTimeHigh.value.gt(prev)) {
          await upsertRecord("portfolio_ath", stats.allTimeHigh.value, stats.allTimeHigh.date, {
            currency,
          });
          await createNotification({
            type: "ACHIEVEMENT",
            title: "New all-time high!",
            message: `Your portfolio hit a new record: ${formatCurrency(stats.allTimeHigh.value, currency)} on ${formatDate(stats.allTimeHigh.date)}`,
            metadata: { key: "portfolio_ath", value: stats.allTimeHigh.value.toString(), currency },
          });
          updated.push("portfolio_ath");
        }
      } catch (err) {
        errors.push(`portfolio_ath: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Best single day (absolute) ────────────────────────────────────────
    if (stats.bestDay && stats.bestDay.changeBase.gt(0)) {
      try {
        const prev = await getRecord("best_day_abs");
        if (!prev || stats.bestDay.changeBase.gt(prev)) {
          await upsertRecord("best_day_abs", stats.bestDay.changeBase, stats.bestDay.date, {
            currency,
            pct: stats.bestDay.changePercent.toFixed(2),
          });
          await createNotification({
            type: "ACHIEVEMENT",
            title: "New best trading day!",
            message: `Biggest ever daily gain: +${formatCurrency(stats.bestDay.changeBase, currency)} (${formatPercent(stats.bestDay.changePercent.dividedBy(100), { signed: true })}) on ${formatDate(stats.bestDay.date)}`,
            metadata: {
              key: "best_day_abs",
              value: stats.bestDay.changeBase.toString(),
              currency,
            },
          });
          updated.push("best_day_abs");
        }
      } catch (err) {
        errors.push(`best_day_abs: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Best single day (percentage) ──────────────────────────────────────
    if (stats.bestDay && stats.bestDay.changePercent.gt(0)) {
      try {
        const prev = await getRecord("best_day_pct");
        if (!prev || stats.bestDay.changePercent.gt(prev)) {
          await upsertRecord("best_day_pct", stats.bestDay.changePercent, stats.bestDay.date, {
            currency,
            abs: stats.bestDay.changeBase.toFixed(2),
          });
          // Only notify if it wasn't already notified via best_day_abs above
          if (!updated.includes("best_day_abs")) {
            await createNotification({
              type: "ACHIEVEMENT",
              title: "New best trading day!",
              message: `Biggest ever daily % gain: +${formatPercent(stats.bestDay.changePercent.dividedBy(100), { signed: true })} (${formatCurrency(stats.bestDay.changeBase, currency)}) on ${formatDate(stats.bestDay.date)}`,
              metadata: {
                key: "best_day_pct",
                value: stats.bestDay.changePercent.toString(),
                currency,
              },
            });
          }
          updated.push("best_day_pct");
        }
      } catch (err) {
        errors.push(`best_day_pct: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    errors.push(`stats: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { updated, errors };
}

