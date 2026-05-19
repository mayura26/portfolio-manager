/**
 * AutoWatcher — fires P&L milestone notifications and AI daily summaries for
 * all instruments with autoWatcherEnabled = true that have open positions.
 * Run via:
 *   npm run cron:autowatcher
 */
import "dotenv/config";
import { runAutoWatcher } from "@/lib/autowatcher";
import { db } from "@/lib/db";

async function run() {
  const result = await runAutoWatcher();
  return { ok: true, ...result };
}

run()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.failures.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("[cron-autowatcher] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
