import "dotenv/config";
import { recordCronRun } from "@/lib/cron-runs";
import { db } from "@/lib/db";
import { runCongressSync } from "@/lib/congress-trades";

recordCronRun({
  job: "congress-trades",
  command: "npm run cron:congress-trades",
  run: () => runCongressSync("cron"),
  ok: (r) => r.ok,
  warnings: (r) => (r.ok ? 0 : 1),
  summary: (r) => ({
    inserted: r.inserted,
    skipped: r.skipped,
    enriched: r.enriched,
    filings: r.filingCount,
    processedFilings: r.processedFilings,
    skippedFilings: r.skippedFilings,
    failedFilings: r.failedFilings,
    ok: r.ok,
  }),
})
  .then(({ result }) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error("[cron-congress-trades] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
