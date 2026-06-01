/**
 * Fetch a real IBKR Flex statement for a group, parse it with the current
 * parser, and print a detailed breakdown — WITHOUT importing anything to the
 * database.  Use this to confirm that forex/fee/interest/withholding entries
 * are being parsed correctly before committing a real sync.
 *
 * Usage:
 *   tsx scripts/debug-live-flex.ts [groupId]
 *
 * With no groupId, uses the first group that has IBKR credentials.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { fetchFlexStatement } from "@/lib/import/ibkr-flex";
import type { ParsedCashTx, ParsedTrade } from "@/lib/import/ibkr-csv";

async function main() {
  const argGroupId = process.argv[2];

  const group = await db.portfolioGroup.findFirst({
    where: argGroupId
      ? { id: argGroupId }
      : { ibkrFlexToken: { not: null }, ibkrFlexQueryId: { not: null } },
    select: {
      id: true,
      name: true,
      baseCurrency: true,
      ibkrFlexToken: true,
      ibkrFlexQueryId: true,
    },
  });

  if (!group) {
    console.error(
      argGroupId
        ? `Group ${argGroupId} not found or has no IBKR credentials`
        : "No groups with IBKR credentials found",
    );
    process.exit(1);
  }
  if (!group.ibkrFlexToken || !group.ibkrFlexQueryId) {
    console.error(`Group "${group.name}" has no IBKR credentials configured`);
    process.exit(1);
  }

  console.log(`Group: ${group.name} (${group.id})`);
  console.log(`Base currency: ${group.baseCurrency}`);
  console.log("Fetching Flex statement …");

  const statement = await fetchFlexStatement(
    group.ibkrFlexToken,
    group.ibkrFlexQueryId,
  );

  // ── Trades ──────────────────────────────────────────────────────────────────
  console.log(`\n=== TRADES (${statement.trades.length}) ===`);
  for (const t of statement.trades) {
    console.log(
      `  ${t.type.padEnd(4)} ${t.symbol.padEnd(12)} ${(t.listingExchange ?? "").padEnd(6)} ` +
        `qty=${t.quantity.padStart(10)} @ ${t.price.padStart(10)} ${t.currency}  ` +
        `${t.date.toISOString().slice(0, 10)}`,
    );
  }

  // ── Cash transactions by type ────────────────────────────────────────────────
  const byType = new Map<string, ParsedCashTx[]>();
  for (const tx of statement.cashTxs) {
    const list = byType.get(tx.type) ?? [];
    list.push(tx);
    byType.set(tx.type, list);
  }

  const typeOrder = [
    "DEPOSIT",
    "WITHDRAWAL",
    "DIVIDEND",
    "INTEREST",
    "WITHHOLDING",
    "FEE",
    "FX_IN",
    "FX_OUT",
  ];
  const sorted = [
    ...typeOrder.filter((t) => byType.has(t)),
    ...[...byType.keys()].filter((t) => !typeOrder.includes(t)),
  ];

  console.log(`\n=== CASH TRANSACTIONS (${statement.cashTxs.length} total) ===`);
  for (const type of sorted) {
    const list = byType.get(type)!;
    const total = list.reduce((s, t) => s + Number(t.amount), 0);
    console.log(
      `\n  [${type}]  ${list.length} entries  net=${total.toFixed(2)}`,
    );
    for (const tx of list.slice(0, 10)) {
      console.log(
        `    ${tx.date.toISOString().slice(0, 10)}  ${tx.amount.padStart(12)} ${tx.currency.padEnd(5)}  ${tx.description.slice(0, 60)}`,
      );
    }
    if (list.length > 10) {
      console.log(`    … and ${list.length - 10} more`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n=== SUMMARY ===`);
  console.log(`  Trades to import:  ${statement.trades.length}`);
  console.log(`  Cash to import:    ${statement.cashTxs.length}`);
  for (const type of sorted) {
    const list = byType.get(type)!;
    console.log(`    ${type.padEnd(12)} ${list.length}`);
  }
  console.log(
    "\nNo data was written to the database. Run `npm run cron:ibkr-sync` to do a real import.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
