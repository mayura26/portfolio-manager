/**
 * Daily FX rate refresh — discovers needed pairs (every portfolio base × every
 * instrument currency) and upserts the last week of closes. Run via:
 *   npm run cron:fx-rates
 */
import "dotenv/config";
import { recordCronRun } from "@/lib/cron-runs";
import { db } from "@/lib/db";
import { fetchFxHistory } from "@/lib/yahoo";

const BACKFILL_DAYS = 7;

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

async function discoverPairs(): Promise<string[]> {
  const portfolios = await db.portfolio.findMany({
    select: { baseCurrency: true },
  });
  const baseCurrencies = new Set(portfolios.map((p) => p.baseCurrency));
  if (baseCurrencies.size === 0) return [];

  const instruments = await db.instrument.findMany({
    select: { currency: true },
  });
  const instrumentCurrencies = new Set(instruments.map((i) => i.currency));

  const pairs = new Set<string>();
  for (const base of baseCurrencies) {
    for (const inst of instrumentCurrencies) {
      if (inst === base) continue;
      pairs.add(`${inst}${base}`);
    }
  }
  return Array.from(pairs);
}

async function run() {
  const pairs = await discoverPairs();
  if (pairs.length === 0) return { ok: true, pairs: 0, bars: 0, failures: [] };

  const from = new Date();
  from.setUTCDate(from.getUTCDate() - BACKFILL_DAYS);

  let totalBars = 0;
  const failures: { pair: string; error: string }[] = [];

  for (const pair of pairs) {
    try {
      const bars = await fetchFxHistory(pair, from);
      for (const bar of bars) {
        await db.fxRate.upsert({
          where: { pair_date: { pair, date: startOfDay(bar.date) } },
          create: {
            pair,
            date: startOfDay(bar.date),
            rate: bar.close.toString(),
          },
          update: { rate: bar.close.toString() },
        });
        totalBars++;
      }
    } catch (err) {
      failures.push({
        pair,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ok: true, pairs: pairs.length, bars: totalBars, failures };
}

recordCronRun({
  job: "fx-rates",
  command: "npm run cron:fx-rates",
  run,
  warnings: (r) => r.failures.length,
  summary: (r) => ({
    pairs: r.pairs,
    bars: r.bars,
    failures: r.failures.length,
  }),
})
  .then((recorded) => {
    const { result } = recorded;
    console.log(JSON.stringify({ runId: recorded.runId, ...result }, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("[cron-fx-rates] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
