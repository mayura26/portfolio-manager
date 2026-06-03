/**
 * Backfill amountMid (and amountLow/amountHigh) for CongressTrade rows whose
 * amount columns are null but whose rangeRaw is parseable.
 *
 * Why: open-ended bands like "Over $250,000" used to parse to a null midpoint,
 * so the largest trades contributed zero dollar volume to the size-weighted
 * clustering. parseAmountRange now uses the floor as a conservative midpoint;
 * this script re-derives amounts for already-synced rows (sync uses
 * skipDuplicates, so it never updates them in place).
 *
 *   tsx scripts/backfill-congress-amounts.ts            # dry run (no writes)
 *   tsx scripts/backfill-congress-amounts.ts --apply    # write changes
 *
 * Idempotent: re-running only touches rows that still have a null amountMid and
 * a now-recoverable value. Updates are grouped by rangeRaw, so each distinct
 * band string is a single updateMany.
 */
import "dotenv/config";
import { parseAmountRange } from "@/lib/congress-trades";
import { db } from "@/lib/db";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(
    apply
      ? "[backfill-congress-amounts] APPLY mode — writing changes"
      : "[backfill-congress-amounts] DRY RUN — no writes (pass --apply to commit)",
  );

  // Distinct band strings among rows that are still missing a midpoint.
  const bands = await db.congressTrade.findMany({
    where: { amountMid: null, rangeRaw: { not: null } },
    select: { rangeRaw: true },
    distinct: ["rangeRaw"],
  });

  console.log(
    `[backfill-congress-amounts] ${bands.length} distinct unparsed band(s) to evaluate`,
  );

  let recoverable = 0;
  let unrecoverable = 0;
  let rowsUpdated = 0;

  for (const { rangeRaw } of bands) {
    if (!rangeRaw) continue;
    const { low, high, mid } = parseAmountRange(rangeRaw);

    if (mid === null) {
      unrecoverable++;
      console.log(`  skip   "${rangeRaw}" — still unparseable`);
      continue;
    }

    recoverable++;
    const count = await db.congressTrade.count({
      where: { amountMid: null, rangeRaw },
    });
    console.log(
      `  fix    "${rangeRaw}" -> low=${low} high=${high} mid=${mid} (${count} row${count === 1 ? "" : "s"})`,
    );

    if (apply) {
      const { count: updated } = await db.congressTrade.updateMany({
        where: { amountMid: null, rangeRaw },
        data: { amountLow: low, amountHigh: high, amountMid: mid },
      });
      rowsUpdated += updated;
    } else {
      rowsUpdated += count;
    }
  }

  console.log("[backfill-congress-amounts] ───────────────────────────");
  console.log(`  recoverable bands:   ${recoverable}`);
  console.log(`  unrecoverable bands: ${unrecoverable}`);
  console.log(
    apply
      ? `  rows updated:        ${rowsUpdated}`
      : `  rows that would update: ${rowsUpdated}`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill-congress-amounts] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
