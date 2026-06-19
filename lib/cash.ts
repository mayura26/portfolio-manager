import Decimal from "decimal.js";
import type { Prisma } from "@/app/generated/prisma/client";
import { db } from "@/lib/db";
import { convert } from "@/lib/fx";
import { visibleTradeWhere } from "@/lib/portfolio-visibility";

const ZERO = new Decimal(0);

export type CashLedgerEntry = {
  id: string;
  kind: "transaction" | "trade";
  date: Date;
  type: string;
  amountBase: Decimal;
  /** Display magnitude in the entry's own currency (always >= 0). */
  amountCurrency: Decimal;
  /** Signed cash effect in the entry's own currency (+ in, − out). */
  amountCurrencySigned: Decimal;
  currency: string;
  notes: string | null;
  source: string | null;
  sourceAccountKey: string | null;
};

export type CurrencyBalance = {
  currency: string;
  /** Net balance in the currency itself. */
  balance: Decimal;
  /** That balance valued in the group base currency at today's FX rate. */
  baseValue: Decimal;
};

export type GroupCash = {
  groupId: string;
  baseCurrency: string;
  /** Total cash in base currency, valued at today's FX rate. */
  currentCash: Decimal;
  /** Per-currency balances (current-rate valuation). */
  byCurrency: CurrencyBalance[];
  seededAndDeposits: Decimal;
  withdrawals: Decimal;
  tradeOutflows: Decimal;
  tradeInflows: Decimal;
  realizedIncome: Decimal;
  ledger: CashLedgerEntry[];
};

// Cash transaction types whose stored `amount` is a positive magnitude that
// represents an OUTFLOW (must be negated to get the signed cash effect).
const OUTFLOW_MAGNITUDE_TYPES = new Set(["WITHDRAWAL", "FX_OUT"]);
// Cash transaction types whose stored `amount` is already signed (IBKR sign
// preserved on import) — used directly without re-deriving the sign.
const SIGNED_TYPES = new Set(["INTEREST", "FEE", "WITHHOLDING"]);
// Everything else (SEED, DEPOSIT, DIVIDEND, FX_IN) is a positive-magnitude inflow.

// Cash movements treated as EXTERNAL flows for time-weighted return: they are
// removed from the return so they neither help nor hurt performance. Fees and
// withholding tax are included here so they don't unfairly drag performance,
// while still affecting the cash balance. DIVIDEND/INTEREST are income (counted
// in return, not flows); FX_IN/FX_OUT are internal conversions (net ~0).
const EXTERNAL_FLOW_TYPES = new Set([
  "DEPOSIT",
  "WITHDRAWAL",
  "SEED",
  "FEE",
  "WITHHOLDING",
]);

/** True if a ledger entry is an external cash flow (excluded from TWR return). */
export function isExternalCashFlow(e: CashLedgerEntry): boolean {
  return e.kind === "transaction" && EXTERNAL_FLOW_TYPES.has(e.type);
}

const REALIZED_CASH_INCOME_TYPES = new Set(["DIVIDEND", "INTEREST"]);

/** Cash income that should be reported as realized profit. */
export function isRealizedCashIncome(e: CashLedgerEntry): boolean {
  return e.kind === "transaction" && REALIZED_CASH_INCOME_TYPES.has(e.type);
}

const groupCashInclude = {
  cashTransactions: { orderBy: { date: "asc" as const } },
  portfolios: {
    include: {
      trades: {
        where: visibleTradeWhere,
        orderBy: { date: "asc" as const },
      },
    },
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
    const stored = new Decimal(ct.amount.toString());
    let nativeSigned: Decimal;
    if (SIGNED_TYPES.has(ct.type)) {
      nativeSigned = stored; // already signed (IBKR sign preserved)
    } else if (OUTFLOW_MAGNITUDE_TYPES.has(ct.type)) {
      nativeSigned = stored.abs().negated();
    } else {
      nativeSigned = stored.abs(); // inflow magnitude
    }
    const baseSigned = await toBase(
      nativeSigned,
      ct.currency,
      baseCurrency,
      ct.date,
    );
    ledger.push({
      id: ct.id,
      kind: "transaction",
      date: ct.date,
      type: ct.type,
      amountBase: baseSigned,
      amountCurrency: nativeSigned.abs(),
      amountCurrencySigned: nativeSigned,
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
        const nativeCost = grossLocal.plus(fees);
        ledger.push({
          id: trade.id,
          kind: "trade",
          date: trade.date,
          type: "BUY",
          amountBase: cost.negated(),
          amountCurrency: nativeCost,
          amountCurrencySigned: nativeCost.negated(),
          currency: trade.currency,
          notes: null,
          source: null,
          sourceAccountKey: null,
        });
      } else {
        const proceeds = grossBase.minus(feesBase);
        const nativeProceeds = grossLocal.minus(fees);
        ledger.push({
          id: trade.id,
          kind: "trade",
          date: trade.date,
          type: "SELL",
          amountBase: proceeds,
          amountCurrency: nativeProceeds,
          amountCurrencySigned: nativeProceeds,
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
  realizedIncome: Decimal;
  currentCash: Decimal;
} {
  let seededAndDeposits = ZERO;
  let withdrawals = ZERO;
  let tradeOutflows = ZERO;
  let tradeInflows = ZERO;
  let realizedIncome = ZERO;
  let currentCash = ZERO;

  for (const e of ledger) {
    currentCash = currentCash.plus(e.amountBase);
    if (e.kind === "transaction") {
      if (e.type === "WITHDRAWAL") {
        withdrawals = withdrawals.plus(e.amountBase.abs());
      } else if (e.type === "SEED" || e.type === "DEPOSIT") {
        seededAndDeposits = seededAndDeposits.plus(e.amountBase);
      }
      if (isRealizedCashIncome(e)) {
        realizedIncome = realizedIncome.plus(e.amountBase);
      }
      // DIVIDEND / INTEREST / FEE / WITHHOLDING / FX_IN / FX_OUT affect the
      // balance, but are not external seed/deposit/withdrawal flows.
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
    realizedIncome,
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

  // Headline cash is valued per-currency at TODAY's FX rate (matching what the
  // broker shows), not the historical-cost sum of transaction-date conversions.
  const base = group.baseCurrency;
  const now = new Date();
  const byCurrency: CurrencyBalance[] = [];
  let currentCash = ZERO;
  for (const [currency, balance] of balancesByCurrency(ledger)) {
    if (balance.isZero()) continue;
    const baseValue = await convert(balance, currency, base, now);
    byCurrency.push({ currency, balance, baseValue });
    currentCash = currentCash.plus(baseValue);
  }
  byCurrency.sort((a, b) => b.baseValue.abs().comparedTo(a.baseValue.abs()));

  return {
    groupId,
    baseCurrency: base,
    currentCash,
    byCurrency,
    seededAndDeposits: agg.seededAndDeposits,
    withdrawals: agg.withdrawals,
    tradeOutflows: agg.tradeOutflows,
    tradeInflows: agg.tradeInflows,
    realizedIncome: agg.realizedIncome,
    ledger,
  };
}

/**
 * Net cash balance per currency (in each currency's own units), summed from the
 * signed ledger. Drives the current-rate valuation and per-currency display.
 */
export function balancesByCurrency(
  ledger: CashLedgerEntry[],
): Map<string, Decimal> {
  const map = new Map<string, Decimal>();
  for (const e of ledger) {
    const ccy = e.currency.toUpperCase();
    map.set(ccy, (map.get(ccy) ?? ZERO).plus(e.amountCurrencySigned));
  }
  return map;
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
