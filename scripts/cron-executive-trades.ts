import "dotenv/config";
import { recordCronRun } from "@/lib/cron-runs";
import { db } from "@/lib/db";
import { runExecutiveSync } from "@/lib/oge-trades";

recordCronRun({
  job: "executive-trades",
  command: "npm run cron:executive-trades",
  run: () => runExecutiveSync("cron"),
  ok: (r) => r.ok,
  warnings: (r) => r.failedFilings,
  summary: (r) => ({
    inserted: r.inserted,
    skipped: r.skipped,
    filings: r.filings,
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
    console.error("[cron-executive-trades] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
