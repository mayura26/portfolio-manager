/**
 * Daily price refresh — fetches the last week of OHLC for every instrument
 * and upserts into PriceHistory. Run as a Coolify scheduled task:
 *   npm run cron:prices
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { fetchDailyHistory } from "@/lib/yahoo";

const BACKFILL_DAYS = 7;

async function run() {
  const instruments = await db.instrument.findMany({
    select: { id: true, yahooSymbol: true },
  });

  if (instruments.length === 0) {
    return { ok: true, instruments: 0, bars: 0, failures: [] };
  }

  const from = new Date();
  from.setUTCDate(from.getUTCDate() - BACKFILL_DAYS);

  let totalBars = 0;
  const failures: { yahooSymbol: string; error: string }[] = [];

  for (const inst of instruments) {
    try {
      const bars = await fetchDailyHistory(inst.yahooSymbol, from);
      if (bars.length === 0) continue;
      const result = await db.priceHistory.createMany({
        data: bars.map((b) => ({
          instrumentId: inst.id,
          date: b.date,
          open: b.open.toString(),
          high: b.high.toString(),
          low: b.low.toString(),
          close: b.close.toString(),
          volume: b.volume === null ? null : BigInt(Math.trunc(b.volume)),
        })),
        skipDuplicates: true,
      });
      totalBars += result.count;
    } catch (err) {
      failures.push({
        yahooSymbol: inst.yahooSymbol,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ok: true, instruments: instruments.length, bars: totalBars, failures };
}

run()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.failures.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("[cron-prices] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
