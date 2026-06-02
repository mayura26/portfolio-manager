/**
 * Weekly AI report — generates and saves the review for the most recent
 * completed Sunday→Saturday week. Run as a Coolify scheduled task (weekly,
 * on a Sunday):
 *   npm run cron:weekly-report
 *
 * Idempotent: if a report already exists for that week, it is left untouched.
 */
import "dotenv/config";
import { NotificationType } from "@/app/generated/prisma/enums";
import { recordCronRun } from "@/lib/cron-runs";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import {
  formatWeekRange,
  getPreviousWeekRange,
  toIsoDate,
} from "@/lib/week-range";
import { getOrCreateWeeklyReport } from "@/lib/weekly-report";

async function run() {
  const { weekStart, weekEnd } = getPreviousWeekRange(new Date());

  const { report, created } = await getOrCreateWeeklyReport(weekStart, weekEnd);
  const reportUrl = `/reviews/weekly/${report.id}`;
  const weekStartIso = toIsoDate(weekStart);
  const weekEndIso = toIsoDate(weekEnd);

  if (created) {
    await createNotification({
      type: NotificationType.SYSTEM,
      title: "Weekly report available",
      message: `Your weekly report for ${formatWeekRange(weekStart, weekEnd)} is ready.`,
      metadata: {
        source: "weekly-report-cron",
        reportId: report.id,
        weekStart: weekStartIso,
        weekEnd: weekEndIso,
        url: reportUrl,
      },
      url: reportUrl,
    });
  }

  return {
    ok: true,
    weekStart: weekStartIso,
    weekEnd: weekEndIso,
    created,
    reportId: report.id,
  };
}

recordCronRun({
  job: "weekly-report",
  command: "npm run cron:weekly-report",
  run,
  summary: (r) => ({
    weekStart: r.weekStart,
    weekEnd: r.weekEnd,
    created: r.created,
    reportId: r.reportId,
  }),
})
  .then((recorded) => {
    const { result } = recorded;
    console.log(JSON.stringify({ runId: recorded.runId, ...result }, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("[cron-weekly-report] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
