/**
 * Weekly AI report — generates and saves the review for the most recent
 * completed Sunday→Saturday week. Run as a Coolify scheduled task (weekly,
 * on a Sunday):
 *   npm run cron:weekly-report
 *
 * Idempotent: if a report already exists for that week, it is left untouched.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { getPreviousWeekRange, toIsoDate } from "@/lib/week-range";
import { getOrCreateWeeklyReport } from "@/lib/weekly-report";

async function run() {
  const { weekStart, weekEnd } = getPreviousWeekRange(new Date());

  const { report, created } = await getOrCreateWeeklyReport(weekStart, weekEnd);

  return {
    ok: true,
    weekStart: toIsoDate(weekStart),
    weekEnd: toIsoDate(weekEnd),
    created,
    reportId: report.id,
  };
}

run()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("[cron-weekly-report] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
