/**
 * Alert evaluation — checks every active alert, fires triggered ones,
 * creates Reviews and Notifications. Run via:
 *   npm run cron:alerts
 */
import "dotenv/config";
import { evaluateAllAlerts } from "@/lib/alerts";
import { db } from "@/lib/db";

async function run() {
  const result = await evaluateAllAlerts();
  return { ok: true, ...result };
}

run()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.failures.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("[cron-alerts] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
