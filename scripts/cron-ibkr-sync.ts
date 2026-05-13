/**
 * IBKR Flex sync — fetches trades for every portfolio group that has Flex
 * credentials configured, routing each symbol to the correct portfolio.
 * Run via: npm run cron:ibkr-sync
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { importToGroup } from "@/lib/import/ibkr-engine";
import { fetchFlexStatement } from "@/lib/import/ibkr-flex";

async function run() {
  const groups = await db.portfolioGroup.findMany({
    where: {
      ibkrFlexToken: { not: null },
      ibkrFlexQueryId: { not: null },
    },
    select: {
      id: true,
      name: true,
      ibkrFlexToken: true,
      ibkrFlexQueryId: true,
    },
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
    const token = group.ibkrFlexToken;
    const queryId = group.ibkrFlexQueryId;
    if (!token || !queryId) continue;

    try {
      const statement = await fetchFlexStatement(token, queryId);
      const result = await importToGroup(
        statement.trades,
        group.id,
        statement.cashTxs,
      );
      results.push({ group: group.name, ok: true, ...result });
    } catch (err) {
      results.push({
        group: group.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

run()
  .then((results) => {
    console.log(JSON.stringify(results, null, 2));
    const anyFailed = results.some(
      (r) => !r.ok || ("failed" in r && r.failed.length > 0),
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
