import Decimal from "decimal.js";
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

/**
 * Compute the current cash balance for a portfolio group.
 *
 * Cash flows in via SEED + DEPOSIT cash transactions and via SELL trade proceeds
 * across every portfolio in the group. Cash flows out via WITHDRAWAL transactions
 * and BUY trade costs (qty * price + fees). All amounts are converted to the
 * group's base currency using the rate on the transaction/trade date.
 */
export async function computeGroupCash(groupId: string): Promise<GroupCash> {
  const group = await db.portfolioGroup.findUnique({
    where: { id: groupId },
    include: {
      cashTransactions: { orderBy: { date: "asc" } },
      portfolios: {
        include: { trades: { orderBy: { date: "asc" } } },
      },
    },
  });
  if (!group) throw new Error(`PortfolioGroup ${groupId} not found`);

  const baseCurrency = group.baseCurrency;
  let seededAndDeposits = ZERO;
  let withdrawals = ZERO;
  let tradeOutflows = ZERO;
  let tradeInflows = ZERO;
  const ledger: CashLedgerEntry[] = [];

  for (const ct of group.cashTransactions) {
    const amount = new Decimal(ct.amount.toString());
    const inBase = await toBase(amount, ct.currency, baseCurrency, ct.date);
    if (ct.type === "WITHDRAWAL") {
      withdrawals = withdrawals.plus(inBase);
    } else {
      seededAndDeposits = seededAndDeposits.plus(inBase);
    }
    ledger.push({
      id: ct.id,
      kind: "transaction",
      date: ct.date,
      type: ct.type,
      amountBase: ct.type === "WITHDRAWAL" ? inBase.negated() : inBase,
      amountCurrency: amount,
      currency: ct.currency,
      notes: ct.notes,
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
        tradeOutflows = tradeOutflows.plus(cost);
        ledger.push({
          id: trade.id,
          kind: "trade",
          date: trade.date,
          type: "BUY",
          amountBase: cost.negated(),
          amountCurrency: grossLocal.plus(fees),
          currency: trade.currency,
          notes: null,
        });
      } else {
        const proceeds = grossBase.minus(feesBase);
        tradeInflows = tradeInflows.plus(proceeds);
        ledger.push({
          id: trade.id,
          kind: "trade",
          date: trade.date,
          type: "SELL",
          amountBase: proceeds,
          amountCurrency: grossLocal.minus(fees),
          currency: trade.currency,
          notes: null,
        });
      }
    }
  }

  ledger.sort((a, b) => a.date.getTime() - b.date.getTime());

  const currentCash = seededAndDeposits
    .minus(withdrawals)
    .plus(tradeInflows)
    .minus(tradeOutflows);

  return {
    groupId,
    baseCurrency,
    currentCash,
    seededAndDeposits,
    withdrawals,
    tradeOutflows,
    tradeInflows,
    ledger,
  };
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
