import "dotenv/config";
import { db } from "@/lib/db";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { getPortfolioStats, type DayStat } from "@/lib/stats";

function printDay(label: string, day: DayStat | null, currency: string) {
  if (!day) {
    console.log(`${label}: none`);
    return;
  }

  console.log(
    `${label}: ${formatDate(day.date)} ${formatCurrency(day.changeBase, currency, {
      signed: true,
    })} (${formatPercent(day.changePercent.dividedBy(100), { signed: true })})`,
  );

  for (const contributor of day.contributors.slice(0, 10)) {
    const share = contributor.sharePercent
      ? `, ${formatPercent(contributor.sharePercent.dividedBy(100), {
          decimals: 0,
          signed: false,
        })} of gross move`
      : "";
    console.log(
      `  ${contributor.symbol}: ${formatCurrency(
        contributor.contributionBase,
        currency,
        { signed: true },
      )} (${formatPercent(contributor.changePercent?.dividedBy(100), {
        signed: true,
      })}${share})`,
    );
  }
}

getPortfolioStats()
  .then((stats) => {
    console.log(`Base currency: ${stats.baseCurrency}`);
    if (stats.allTimeHigh) {
      console.log(
        `All-time high: ${formatDate(stats.allTimeHigh.date)} ${formatCurrency(
          stats.allTimeHigh.value,
          stats.baseCurrency,
        )}`,
      );
    }
    printDay("Best market day", stats.bestDay, stats.baseCurrency);
    printDay("Worst market day", stats.worstDay, stats.baseCurrency);
  })
  .catch((err) => {
    console.error("[diagnose-single-day-records] fatal", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
