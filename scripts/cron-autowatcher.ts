/**
 * AutoWatcher — fires P&L milestone notifications and AI daily summaries for
 * all instruments with autoWatcherEnabled = true that have open positions.
 * Run via:
 *   npm run cron:autowatcher
 */
import "dotenv/config";
import { recordCronRun } from "@/lib/cron-runs";
import { runAutoWatcher } from "@/lib/autowatcher";
import { db } from "@/lib/db";

async function run() {
  const result = await runAutoWatcher();
  return { ok: true, ...result };
}

recordCronRun({
  job: "autowatcher",
  command: "npm run cron:autowatcher",
  run,
  warnings: (r) => r.failures.length,
  summary: (r) => ({
    processed: r.processed,
    pnlFired: r.pnlFired,
    dailyFired: r.dailyFired,
    dailyDeferred: r.dailyDeferred,
    skipped: r.skipped,
    failures: r.failures.length,
  }),
})
  .then((recorded) => {
    const { result } = recorded;
    console.log(JSON.stringify({ runId: recorded.runId, ...result }, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("[cron-autowatcher] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
