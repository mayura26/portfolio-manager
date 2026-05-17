import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { fetchDailyHistory } from "@/lib/yahoo";

export const BENCHMARK_YAHOO_SYMBOL = "^GSPC";
export const BENCHMARK_LABEL = "S&P 500";

/** Tolerance for treating stored history as already covering `since` — */
/** absorbs weekends/holidays so we don't refetch on every render. */
const SINCE_TOLERANCE_MS = 5 * 24 * 60 * 60 * 1000;

async function ensureBenchmarkInstrumentId(): Promise<string | null> {
  const existing = await db.instrument.findUnique({
    where: { yahooSymbol: BENCHMARK_YAHOO_SYMBOL },
    select: { id: true },
  });
  if (existing) return existing.id;

  try {
    const created = await db.instrument.create({
      data: {
        symbol: BENCHMARK_YAHOO_SYMBOL,
        exchange: "SNP",
        yahooSymbol: BENCHMARK_YAHOO_SYMBOL,
        name: BENCHMARK_LABEL,
        currency: "USD",
        instrumentType: "INDEX",
      },
      select: { id: true },
    });
    return created.id;
  } catch {
    // Likely a concurrent create — re-fetch.
    const retry = await db.instrument.findUnique({
      where: { yahooSymbol: BENCHMARK_YAHOO_SYMBOL },
      select: { id: true },
    });
    return retry?.id ?? null;
  }
}

/**
 * Daily S&P 500 closes from `since` to today, used as a benchmark overlay.
 *
 * Lazily creates the ^GSPC instrument and backfills any history gap before
 * `since`; the regular price cron (`cron:prices`) keeps it fresh thereafter
 * since it refreshes every instrument in the DB.
 */
export async function getBenchmarkCloses(
  since: Date,
): Promise<{ date: Date; close: Decimal }[]> {
  const instrumentId = await ensureBenchmarkInstrumentId();
  if (!instrumentId) return [];

  const earliest = await db.priceHistory.findFirst({
    where: { instrumentId },
    orderBy: { date: "asc" },
    select: { date: true },
  });

  if (
    !earliest ||
    earliest.date.getTime() - since.getTime() > SINCE_TOLERANCE_MS
  ) {
    try {
      const to = earliest?.date ?? new Date();
      const bars = await fetchDailyHistory(BENCHMARK_YAHOO_SYMBOL, since, to);
      if (bars.length > 0) {
        await db.priceHistory.createMany({
          data: bars.map((b) => ({
            instrumentId,
            date: b.date,
            open: b.open.toString(),
            high: b.high.toString(),
            low: b.low.toString(),
            close: b.close.toString(),
            volume: b.volume === null ? null : BigInt(Math.trunc(b.volume)),
          })),
          skipDuplicates: true,
        });
      }
    } catch {
      // Non-fatal: fall back to whatever history is already stored.
    }
  }

  const rows = await db.priceHistory.findMany({
    where: { instrumentId, date: { gte: since } },
    orderBy: { date: "asc" },
    select: { date: true, close: true },
  });
  return rows.map((r) => ({
    date: r.date,
    close: new Decimal(r.close.toString()),
  }));
}
