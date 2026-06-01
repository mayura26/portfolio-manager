/**
 * Read-only diagnostic for a group's cash. Shows the per-currency balances, how
 * the headline total differs between the old historical-sum method and the new
 * current-rate method, and a breakdown of cash transactions by type/source —
 * so the computed balances can be eyeballed against the IBKR account window.
 *
 *   tsx scripts/diagnose-group-cash.ts [groupId]
 *
 * With no groupId, lists all groups and runs against each.
 */
import "dotenv/config";
import Decimal from "decimal.js";
import { balancesByCurrency, getGroupCashLedger } from "@/lib/cash";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { getFxRate } from "@/lib/fx";

async function diagnose(groupId: string) {
  const group = await db.portfolioGroup.findUnique({ where: { id: groupId } });
  if (!group) {
    console.log(`Group ${groupId} not found`);
    return;
  }

  console.log(`\n========================================`);
  console.log(`Group: ${group.name} (${group.id})`);
  console.log(`Base currency: ${group.baseCurrency}`);

  const { ledger } = await getGroupCashLedger(groupId);

  // Old method: historical-cost sum of transaction-date conversions.
  const historical = ledger.reduce(
    (s, e) => s.plus(e.amountBase),
    new Decimal(0),
  );

  // New method: per-currency balance valued at today's FX rate.
  const now = new Date();
  const balances = balancesByCurrency(ledger);
  let currentRateTotal = new Decimal(0);
  console.log(`\n--- Per-currency balances (current-rate) ---`);
  for (const [ccy, balance] of balances) {
    const rate =
      ccy === group.baseCurrency.toUpperCase()
        ? new Decimal(1)
        : await getFxRate(ccy, group.baseCurrency, now);
    const baseValue = balance.times(rate);
    currentRateTotal = currentRateTotal.plus(baseValue);
    console.log(
      `  ${ccy.padEnd(5)} ${balance.toFixed(2).padStart(14)}  @ ${rate.toFixed(6)}  ` +
        `= ${formatCurrency(baseValue.toString(), group.baseCurrency)}`,
    );
  }

  console.log(`\n--- Headline total ---`);
  console.log(
    `  Old (historical sum): ${formatCurrency(historical.toString(), group.baseCurrency)}`,
  );
  console.log(
    `  New (current-rate):   ${formatCurrency(currentRateTotal.toString(), group.baseCurrency)}`,
  );
  console.log(
    `  Delta:                ${formatCurrency(currentRateTotal.minus(historical).toString(), group.baseCurrency, { signed: true })}`,
  );

  const byType = await db.cashTransaction.groupBy({
    by: ["type", "source"],
    where: { groupId },
    _count: { _all: true },
  });
  console.log(`\n--- Cash transactions by type / source ---`);
  for (const row of byType.sort((a, b) => (a.type < b.type ? -1 : 1))) {
    console.log(
      `  ${String(row.type).padEnd(12)} ${String(row.source).padEnd(18)} ${row._count._all}`,
    );
  }
}

async function main() {
  const arg = process.argv[2];
  if (arg) {
    await diagnose(arg);
  } else {
    const groups = await db.portfolioGroup.findMany({
      select: { id: true, name: true },
    });
    console.log(`No groupId given — running for all ${groups.length} groups.`);
    for (const g of groups) await diagnose(g.id);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
