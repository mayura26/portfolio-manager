/**
 * IBKR Flex sync — fetches trades via the Flex Web Service and upserts
 * into the configured portfolio. Requires ibkrFlexToken, ibkrFlexQueryId,
 * and ibkrPortfolioId to be set in Settings. Run via:
 *   npm run cron:ibkr-sync
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { getSettings } from "@/actions/settings";
import { fetchFlexTrades } from "@/lib/import/ibkr-flex";
import { importTrades } from "@/lib/import/ibkr-engine";

async function run() {
  const settings = await getSettings();

  if (!settings.ibkrFlexToken) {
    console.error("[cron-ibkr-sync] ibkrFlexToken not configured in Settings");
    process.exit(1);
  }
  if (!settings.ibkrFlexQueryId) {
    console.error(
      "[cron-ibkr-sync] ibkrFlexQueryId not configured in Settings",
    );
    process.exit(1);
  }
  if (!settings.ibkrPortfolioId) {
    console.error(
      "[cron-ibkr-sync] ibkrPortfolioId not configured in Settings",
    );
    process.exit(1);
  }

  const trades = await fetchFlexTrades(
    settings.ibkrFlexToken,
    settings.ibkrFlexQueryId,
  );

  const result = await importTrades(trades, settings.ibkrPortfolioId);

  return result;
}

run()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.failed.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("[cron-ibkr-sync] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
