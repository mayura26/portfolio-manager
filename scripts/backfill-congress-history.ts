/**
 * Historical backfill for House congressional trades.
 *
 * The regular cron only reaches back 90 days on its first run, then runs
 * incrementally forward — so anything older than the first sync is never
 * fetched. This script runs the same House pipeline (ingestHouseFilings) over an
 * explicit date range to pull history. Inserts use skipDuplicates, so it is safe
 * to run alongside the cron and idempotent to re-run.
 *
 *   tsx scripts/backfill-congress-history.ts                 # dry run (counts only)
 *   tsx scripts/backfill-congress-history.ts --apply         # write changes
 *   tsx scripts/backfill-congress-history.ts --from 2021-01-01 --apply
 *
 * Heads-up: a multi-year range downloads many PDFs and can take a long while;
 * the pipeline throttles with 5-concurrent batches + sleeps to stay polite.
 */
import "dotenv/config";
import { fetchFilingIndex, ingestHouseFilings } from "@/lib/congress-trades";
import { db } from "@/lib/db";

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const fromStr = parseArg("--from") ?? "2023-01-01";
  const from = new Date(`${fromStr}T00:00:00Z`);
  if (Number.isNaN(from.getTime())) {
    console.error(
      `[backfill-congress-history] invalid --from date: ${fromStr}`,
    );
    process.exit(1);
  }
  const to = new Date();

  console.log(
    `[backfill-congress-history] range ${from.toISOString().slice(0, 10)} -> ${to.toISOString().slice(0, 10)}`,
  );

  if (!apply) {
    // Dry run: just enumerate the filing index so the user can gauge volume
    // without downloading every PDF or writing anything.
    const filings = await fetchFilingIndex(from, to);
    console.log(
      `[backfill-congress-history] DRY RUN — ${filings.length} PTR filing(s) in range. Pass --apply to fetch + insert.`,
    );
    return;
  }

  const result = await ingestHouseFilings(from, to);
  console.log("[backfill-congress-history] ───────────────────────────");
  console.log(`  filings:  ${result.filingCount}`);
  console.log(`  inserted: ${result.inserted}`);
  console.log(`  skipped:  ${result.skipped} (already present)`);
  console.log(`  enriched: ${result.enriched} tickers`);
}

main()
  .catch((err) => {
    console.error("[backfill-congress-history] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
