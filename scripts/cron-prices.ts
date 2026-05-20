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
import { db } from "@/lib/db";
import { runPriceRefresh } from "@/lib/price-refresh";

runPriceRefresh("cron")
  .then(({ runId, outcome }) => {
    console.log(JSON.stringify({ runId, ...outcome }, null, 2));
    process.exit(outcome.ok && outcome.failures.length === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error("[cron-prices] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
