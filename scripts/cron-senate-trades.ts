import "dotenv/config";
import { recordCronRun } from "@/lib/cron-runs";
import { db } from "@/lib/db";
import { runSenateSync } from "@/lib/senate-trades";

recordCronRun({
  job: "senate-trades",
  command: "npm run cron:senate-trades",
  run: () => runSenateSync("cron"),
  ok: (r) => r.ok,
  warnings: (r) => (r.ok ? 0 : 1),
  summary: (r) => ({
    inserted: r.inserted,
    skipped: r.skipped,
    enriched: r.enriched,
    reports: r.filingCount,
    ok: r.ok,
  }),
})
  .then(({ result }) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error("[cron-senate-trades] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
