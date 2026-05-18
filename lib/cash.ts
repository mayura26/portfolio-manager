import Decimal from "decimal.js";
import type { Prisma } from "@/app/generated/prisma/client";
import { db } from "@/lib/db";
import { convert } from "@/lib/fx";

const ZERO = new Decimal(0);

export type CashLedgerEntry = {
  id: string;
  kind: "transaction" | "trade";
  date: Date;
  type: string;
  amountBase: Decimal;
  amountCurrency: Decimal;
  currency: string;
  notes: string | null;
  source: string | null;
  sourceAccountKey: string | null;
};

export type GroupCash = {
  groupId: string;
  baseCurrency: string;
  currentCash: Decimal;
  seededAndDeposits: Decimal;
  withdrawals: Decimal;
  tradeOutflows: Decimal;
  tradeInflows: Decimal;
  ledger: CashLedgerEntry[];
};

const groupCashInclude = {
  cashTransactions: { orderBy: { date: "asc" as const } },
  portfolios: {
    include: { trades: { orderBy: { date: "asc" as const } } },
  },
} satisfies Prisma.PortfolioGroupInclude;

type GroupWithCashRelations = Prisma.PortfolioGroupGetPayload<{
  include: typeof groupCashInclude;
}>;

async function loadGroupForCash(
  groupId: string,
): Promise<GroupWithCashRelations> {
  const group = await db.portfolioGroup.findUnique({
    where: { id: groupId },
    include: groupCashInclude,
  });
  if (!group) throw new Error(`PortfolioGroup ${groupId} not found`);
  return group;
}

async function materializeLedgerForGroup(
  group: GroupWithCashRelations,
): Promise<CashLedgerEntry[]> {
  const baseCurrency = group.baseCurrency;
  const ledger: CashLedgerEntry[] = [];

  for (const ct of group.cashTransactions) {
    const amount = new Decimal(ct.amount.toString());
    const inBase = await toBase(amount, ct.currency, baseCurrency, ct.date);
    ledger.push({
      id: ct.id,
      kind: "transaction",
      date: ct.date,
      type: ct.type,
      amountBase: ct.type === "WITHDRAWAL" ? inBase.negated() : inBase,
      amountCurrency: amount,
      currency: ct.currency,
      notes: ct.notes,
      source: ct.source,
      sourceAccountKey: ct.sourceAccountKey,
    });
  }

  for (const portfolio of group.portfolios) {
    for (const trade of portfolio.trades) {
      const qty = new Decimal(trade.quantity.toString());
      const price = new Decimal(trade.price.toString());
      const fees = new Decimal(trade.fees.toString());
      const grossLocal = price.times(qty);
      const grossBase = await toBase(
        grossLocal,
        trade.currency,
        baseCurrency,
        trade.date,
      );
      const feesBase = await toBase(
        fees,
        trade.currency,
        baseCurrency,
        trade.date,
      );
      if (trade.type === "BUY") {
        const cost = grossBase.plus(feesBase);
        ledger.push({
          id: trade.id,
          kind: "trade",
          date: trade.date,
          type: "BUY",
          amountBase: cost.negated(),
          amountCurrency: grossLocal.plus(fees),
          currency: trade.currency,
          notes: null,
          source: null,
          sourceAccountKey: null,
        });
      } else {
        const proceeds = grossBase.minus(feesBase);
        ledger.push({
          id: trade.id,
          kind: "trade",
          date: trade.date,
          type: "SELL",
          amountBase: proceeds,
          amountCurrency: grossLocal.minus(fees),
          currency: trade.currency,
          notes: null,
          source: null,
          sourceAccountKey: null,
        });
      }
    }
  }

  ledger.sort((a, b) => a.date.getTime() - b.date.getTime());
  return ledger;
}

function aggregatesFromLedger(ledger: CashLedgerEntry[]): {
  seededAndDeposits: Decimal;
  withdrawals: Decimal;
  tradeOutflows: Decimal;
  tradeInflows: Decimal;
  currentCash: Decimal;
} {
  let seededAndDeposits = ZERO;
  let withdrawals = ZERO;
  let tradeOutflows = ZERO;
  let tradeInflows = ZERO;
  let currentCash = ZERO;

  for (const e of ledger) {
    currentCash = currentCash.plus(e.amountBase);
    if (e.kind === "transaction") {
      if (e.type === "WITHDRAWAL") {
        withdrawals = withdrawals.plus(e.amountBase.abs());
      } else {
        seededAndDeposits = seededAndDeposits.plus(e.amountBase);
      }
    } else if (e.type === "BUY") {
      tradeOutflows = tradeOutflows.plus(e.amountBase.abs());
    } else {
      tradeInflows = tradeInflows.plus(e.amountBase);
    }
  }

  return {
    seededAndDeposits,
    withdrawals,
    tradeOutflows,
    tradeInflows,
    currentCash,
  };
}

/**
 * Sorted cash ledger for a group (group base currency), for history charts and computeGroupCash.
 */
export async function getGroupCashLedger(
  groupId: string,
): Promise<{ baseCurrency: string; ledger: CashLedgerEntry[] }> {
  const group = await loadGroupForCash(groupId);
  const ledger = await materializeLedgerForGroup(group);
  return { baseCurrency: group.baseCurrency, ledger };
}

/**
 * Compute the current cash balance for a portfolio group.
 *
 * Cash flows in via SEED + DEPOSIT cash transactions and via SELL trade proceeds
 * across every portfolio in the group. Cash flows out via WITHDRAWAL transactions
 * and BUY trade costs (qty * price + fees). All amounts are converted to the
 * group's base currency using the rate on the transaction/trade date.
 */
export async function computeGroupCash(groupId: string): Promise<GroupCash> {
  const group = await loadGroupForCash(groupId);
  const ledger = await materializeLedgerForGroup(group);
  const agg = aggregatesFromLedger(ledger);

  return {
    groupId,
    baseCurrency: group.baseCurrency,
    currentCash: agg.currentCash,
    seededAndDeposits: agg.seededAndDeposits,
    withdrawals: agg.withdrawals,
    tradeOutflows: agg.tradeOutflows,
    tradeInflows: agg.tradeInflows,
    ledger,
  };
}

export function cashBalanceInGroupBaseThroughUtcDay(
  ledger: CashLedgerEntry[],
  throughDay: Date,
): Decimal {
  const through = utcDayKey(throughDay);
  let sum = ZERO;
  for (const e of ledger) {
    if (utcDayKey(e.date) <= through) {
      sum = sum.plus(e.amountBase);
    }
  }
  return sum;
}

export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function toBase(
  amount: Decimal,
  fromCurrency: string,
  toCurrency: string,
  asOf: Date,
): Promise<Decimal> {
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) return amount;
  return convert(amount, fromCurrency, toCurrency, asOf);
}
