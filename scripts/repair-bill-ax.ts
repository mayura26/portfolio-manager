/**
 * Repair prod trades that were imported as the US BILL ticker when IBKR meant
 * the ASX ticker BILL.AX.
 *
 * Dry run:
 *   npx tsx scripts/repair-bill-ax.ts
 *
 * Apply:
 *   npx tsx scripts/repair-bill-ax.ts --apply
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { findOrCreateInstrument } from "@/lib/instruments";

const apply = process.argv.includes("--apply");
const unknownArgs = process.argv
  .slice(2)
  .filter((arg) => arg !== "--apply" && arg !== "--help");

if (process.argv.includes("--help")) {
  console.log("Usage: npx tsx scripts/repair-bill-ax.ts [--apply]");
  process.exit(0);
}

if (unknownArgs.length > 0) {
  console.error(`Unknown argument(s): ${unknownArgs.join(", ")}`);
  process.exit(1);
}

function formatDate(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "n/a";
}

async function main() {
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);

  const source = await db.instrument.findUnique({
    where: { yahooSymbol: "BILL" },
    select: {
      id: true,
      symbol: true,
      yahooSymbol: true,
      exchange: true,
      currency: true,
      name: true,
      _count: {
        select: {
          trades: true,
          notes: true,
          alerts: true,
          reviews: true,
          targets: true,
          watchlistItems: true,
          forecasts: true,
        },
      },
    },
  });

  if (!source) {
    console.log("No source instrument found for yahooSymbol=BILL.");
    return;
  }

  const target = await db.instrument.findUnique({
    where: { yahooSymbol: "BILL.AX" },
    select: {
      id: true,
      symbol: true,
      yahooSymbol: true,
      exchange: true,
      currency: true,
      name: true,
    },
  });

  const tradeWhere = { instrumentId: source.id, currency: "AUD" };
  const tradeCount = await db.trade.count({ where: tradeWhere });
  const dateRange = await db.trade.aggregate({
    where: tradeWhere,
    _min: { date: true },
    _max: { date: true },
  });
  const portfolioGroups = await db.trade.groupBy({
    by: ["portfolioId"],
    where: tradeWhere,
    _count: { _all: true },
    _min: { date: true },
    _max: { date: true },
  });
  const portfolios = await db.portfolio.findMany({
    where: { id: { in: portfolioGroups.map((row) => row.portfolioId) } },
    select: { id: true, name: true, group: { select: { name: true } } },
  });
  const portfolioNames = new Map(
    portfolios.map((portfolio) => [
      portfolio.id,
      `${portfolio.group.name} / ${portfolio.name}`,
    ]),
  );

  console.log("\nSource instrument:");
  console.log(JSON.stringify(source, null, 2));

  console.log("\nTarget instrument:");
  if (target) {
    console.log(JSON.stringify(target, null, 2));
  } else {
    console.log("BILL.AX does not exist yet. Apply mode will create it.");
  }

  console.log("\nAUD trades attached to source BILL:");
  console.log(`Count: ${tradeCount}`);
  console.log(
    `Date range: ${formatDate(dateRange._min.date)} to ${formatDate(
      dateRange._max.date,
    )}`,
  );

  if (portfolioGroups.length > 0) {
    console.log("\nAffected portfolios:");
    for (const row of portfolioGroups) {
      console.log(
        `- ${portfolioNames.get(row.portfolioId) ?? row.portfolioId}: ${row._count._all} trade(s), ${formatDate(row._min.date)} to ${formatDate(row._max.date)}`,
      );
    }
  }

  console.log("\nRelated source records not moved by this script:");
  console.log(
    JSON.stringify(
      {
        notes: source._count.notes,
        alerts: source._count.alerts,
        reviews: source._count.reviews,
        targets: source._count.targets,
        watchlistItems: source._count.watchlistItems,
        forecasts: source._count.forecasts,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to move the AUD trades.");
    return;
  }

  if (tradeCount === 0) {
    console.log("\nNo matching trades to move.");
    return;
  }

  const finalTarget =
    target ??
    (await findOrCreateInstrument("BILL.AX", {
      currencyHint: "AUD",
      listingExchange: "ASX",
    }));

  const result = await db.trade.updateMany({
    where: tradeWhere,
    data: { instrumentId: finalTarget.id },
  });

  console.log(
    `\nMoved ${result.count} AUD trade(s) from BILL to ${finalTarget.yahooSymbol}.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
