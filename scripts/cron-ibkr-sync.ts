/**
 * IBKR Flex sync — fetches trades for every portfolio group that has Flex
 * credentials configured, routing each symbol to the correct portfolio.
 * Run via: npm run cron:ibkr-sync
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { runIbkrSyncForGroup } from "@/lib/import/ibkr-sync";

async function run() {
  const groups = await db.portfolioGroup.findMany({
    where: {
      ibkrFlexToken: { not: null },
      ibkrFlexQueryId: { not: null },
    },
    select: { id: true, name: true },
  });

  if (groups.length === 0) {
    console.log(
      JSON.stringify({
        ok: true,
        message: "No groups have IBKR credentials configured",
      }),
    );
    return [];
  }

  const results = [];

  for (const group of groups) {
    const outcome = await runIbkrSyncForGroup(group.id, "cron");
    if (outcome.ok) {
      results.push({
        group: group.name,
        ok: true,
        inserted: outcome.inserted,
        skipped: outcome.skipped,
        cashInserted: outcome.cashInserted,
        cashSkipped: outcome.cashSkipped,
        failed: outcome.failed,
      });
    } else {
      results.push({ group: group.name, ok: false, error: outcome.error });
    }
  }

  return results;
}

run()
  .then((results) => {
    console.log(JSON.stringify(results, null, 2));
    const anyFailed = results.some(
      (r) => !r.ok || ("failed" in r && (r.failed?.length ?? 0) > 0),
    );
    process.exit(anyFailed ? 1 : 0);
  })
  .catch((err) => {
    console.error("[cron-ibkr-sync] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
