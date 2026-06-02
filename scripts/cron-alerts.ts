/**
 * Alert evaluation — checks every active alert, fires triggered ones,
 * creates Reviews and Notifications. Run via:
 *   npm run cron:alerts
 */
import "dotenv/config";
import { checkAndUpdateAchievements } from "@/lib/achievement-checks";
import { evaluateAllAlerts } from "@/lib/alerts";
import { recordCronRun } from "@/lib/cron-runs";
import { db } from "@/lib/db";

async function run() {
  const alertResult = await evaluateAllAlerts();
  const achievementResult = await checkAndUpdateAchievements();
  return { ok: true, ...alertResult, achievements: achievementResult };
}

recordCronRun({
  job: "alerts",
  command: "npm run cron:alerts",
  run,
  warnings: (r) => r.failures.length + r.achievements.errors.length,
  summary: (r) => ({
    evaluated: r.evaluated,
    triggered: r.triggered,
    alertFailures: r.failures.length,
    achievementUpdates: r.achievements.updated.length,
    achievementErrors: r.achievements.errors.length,
  }),
})
  .then((recorded) => {
    const { result } = recorded;
    console.log(JSON.stringify({ runId: recorded.runId, ...result }, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("[cron-alerts] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
