import Decimal from "decimal.js";
import { db } from "@/lib/db";

export type PriceChangeData = {
  instrumentId: string;
  currentPrice: Decimal;
  currentDate: Date;
  dayPct: Decimal | null;
  weekPct: Decimal | null;
  monthPct: Decimal | null;
  yearPct: Decimal | null;
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function priceOnOrBefore(
  prices: { date: Date; close: Decimal }[],
  asOf: Date,
): Decimal | null {
  const key = dayKey(asOf);
  let result: Decimal | null = null;
  for (const p of prices) {
    if (dayKey(p.date) > key) break;
    result = p.close;
  }
  return result;
}

function pctChange(current: Decimal, anchor: Decimal | null): Decimal | null {
  if (!anchor || anchor.isZero()) return null;
  return current.dividedBy(anchor).minus(1).times(100);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Loads day/week/month/year % changes for a set of instruments using exactly
 * two SQL queries (latest price per instrument + bulk history for the last year).
 */
export async function loadPriceChanges(
  instrumentIds: string[],
): Promise<Map<string, PriceChangeData>> {
  if (instrumentIds.length === 0) return new Map();

  const yearAgo = new Date();
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  yearAgo.setUTCDate(yearAgo.getUTCDate() - 5); // small buffer for weekends

  const rows = await db.priceHistory.findMany({
    where: {
      instrumentId: { in: instrumentIds },
      date: { gte: yearAgo },
    },
    orderBy: [{ instrumentId: "asc" }, { date: "asc" }],
    select: { instrumentId: true, date: true, close: true },
  });

  // Group by instrumentId (rows are already sorted asc by instrumentId, date)
  const byInstrument = new Map<string, { date: Date; close: Decimal }[]>();
  for (const row of rows) {
    let arr = byInstrument.get(row.instrumentId);
    if (!arr) {
      arr = [];
      byInstrument.set(row.instrumentId, arr);
    }
    arr.push({ date: row.date, close: new Decimal(row.close.toString()) });
  }

  const result = new Map<string, PriceChangeData>();

  for (const instrumentId of instrumentIds) {
    const prices = byInstrument.get(instrumentId);
    if (!prices || prices.length === 0) continue;

    // Latest price is the last element (sorted asc)
    const latest = prices[prices.length - 1];
    const currentPrice = latest.close;
    const currentDate = latest.date;

    const dayAnchor = priceOnOrBefore(prices, addDays(currentDate, -1));
    const weekAnchor = priceOnOrBefore(prices, addDays(currentDate, -7));
    const monthAnchor = priceOnOrBefore(prices, addDays(currentDate, -30));
    const yearAnchor = priceOnOrBefore(prices, addDays(currentDate, -365));

    result.set(instrumentId, {
      instrumentId,
      currentPrice,
      currentDate,
      dayPct: pctChange(currentPrice, dayAnchor),
      weekPct: pctChange(currentPrice, weekAnchor),
      monthPct: pctChange(currentPrice, monthAnchor),
      yearPct: pctChange(currentPrice, yearAnchor),
    });
  }

  return result;
}
