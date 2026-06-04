/**
 * Combined trades cron — a single scheduled task that runs every trade-data
 * source in sequence (House congress PTRs, Senate PTRs, SEC Form 4 insider).
 * Each source still records its own CronJobRun row, so the Data sync status
 * panel keeps per-source health/history and the per-source Run buttons keep
 * working — but Coolify only needs ONE scheduled task ("npm run cron:trades").
 *
 * One source failing does not abort the others; the process exits non-zero if
 * any source failed.
 */
import "dotenv/config";
import { runCongressSync } from "@/lib/congress-trades";
import type { CronJobName } from "@/lib/cron-runs";
import { recordCronRun } from "@/lib/cron-runs";
import { db } from "@/lib/db";
import { runInsiderSync } from "@/lib/insider-trades";
import { runExecutiveSync } from "@/lib/oge-trades";
import { runSenateSync } from "@/lib/senate-trades";

async function runOne<T extends { ok: boolean }>(
  job: CronJobName,
  run: () => Promise<T>,
  summary: (r: T) => Record<string, string | number | boolean>,
): Promise<boolean> {
  try {
    const { result } = await recordCronRun({
      job,
      command: "npm run cron:trades",
      run,
      ok: (r) => r.ok,
      warnings: (r) => (r.ok ? 0 : 1),
      summary,
    });
    console.log(`[cron-trades] ${job}: ${JSON.stringify(result)}`);
    return result.ok;
  } catch (err) {
    console.error(`[cron-trades] ${job} failed`, err);
    return false;
  }
}

async function main() {
  const results = [
    await runOne(
      "congress-trades",
      () => runCongressSync("cron"),
      (r) => ({
        inserted: r.inserted,
        skipped: r.skipped,
        enriched: r.enriched,
        filings: r.filingCount,
        ok: r.ok,
      }),
    ),
    await runOne(
      "senate-trades",
      () => runSenateSync("cron"),
      (r) => ({
        inserted: r.inserted,
        skipped: r.skipped,
        enriched: r.enriched,
        reports: r.filingCount,
        ok: r.ok,
      }),
    ),
    await runOne(
      "insider-trades",
      () => runInsiderSync("cron"),
      (r) => ({
        inserted: r.inserted,
        skipped: r.skipped,
        tickers: r.tickers,
        filings: r.filings,
        ok: r.ok,
      }),
    ),
    await runOne(
      "executive-trades",
      () => runExecutiveSync("cron"),
      (r) => ({
        inserted: r.inserted,
        skipped: r.skipped,
        filings: r.filings,
        ok: r.ok,
      }),
    ),
  ];

  const allOk = results.every(Boolean);
  process.exit(allOk ? 0 : 1);
}

main()
  .catch((err) => {
    console.error("[cron-trades] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
