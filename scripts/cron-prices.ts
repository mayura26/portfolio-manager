/**
 * Daily price refresh — fetches the last week of OHLC for every instrument
 * and upserts into PriceHistory. Run as a Coolify scheduled task:
 *   npm run cron:prices
 *
 * Writes one PriceRefreshRun row per invocation so the Reviews → IBKR sync
 * tab can display status. The actual refresh logic lives in lib/price-refresh.ts
 * and is shared with the manual "Refresh now" server action.
 */
import "dotenv/config";
import { recordCronRun } from "@/lib/cron-runs";
import { db } from "@/lib/db";
import { runPriceRefresh } from "@/lib/price-refresh";

recordCronRun({
  job: "prices",
  command: "npm run cron:prices",
  run: async () => {
    const { runId, outcome } = await runPriceRefresh("cron");
    return { priceRefreshRunId: runId, ...outcome };
  },
  ok: (r) => r.ok,
  warnings: (r) => r.failures.length + (r.ok ? 0 : 1),
  summary: (r) => ({
    priceRefreshRunId: r.priceRefreshRunId,
    instruments: r.instruments,
    bars: r.bars,
    failures: r.failures.length,
    ok: r.ok,
  }),
})
  .then((recorded) => {
    const { result } = recorded;
    console.log(
      JSON.stringify(
        {
          runId: result.priceRefreshRunId,
          cronRunId: recorded.runId,
          ...result,
        },
        null,
        2,
      ),
    );
    process.exit(result.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error("[cron-prices] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
