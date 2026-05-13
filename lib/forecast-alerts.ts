import { db } from "@/lib/db";

// Creates a TARGET_HIT alert for the given forecast and dismisses any
// previously active TARGET_HIT alerts on the same instrument so weekly cron
// regeneration doesn't accumulate stale alerts.
export async function ensureTargetHitAlert(
  forecastId: string,
  instrumentId: string,
  symbol: string,
  targetPrice: number,
) {
  const existing = await db.alert.findFirst({
    where: { forecastId, type: "TARGET_HIT", status: "ACTIVE" },
  });
  if (existing) return existing.id;

  await db.alert.updateMany({
    where: {
      instrumentId,
      type: "TARGET_HIT",
      status: "ACTIVE",
      forecastId: { not: forecastId },
    },
    data: { status: "DISMISSED" },
  });

  const alert = await db.alert.create({
    data: {
      type: "TARGET_HIT",
      priceDirection: "above",
      instrumentId,
      forecastId,
      priceTarget: targetPrice.toString(),
      message: `${symbol}: price reached forecast target`,
    },
  });
  return alert.id;
}
