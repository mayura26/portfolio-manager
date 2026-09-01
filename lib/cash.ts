import Decimal from "decimal.js";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  type CashVehicleKind,
  cashVehicleLabel,
  classifyExternalCashAccountKind,
} from "@/lib/cash-vehicles";
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
  accountType: string | null;
  vehicleKind: CashVehicleKind;
  vehicleLabel: string;
};

export type CurrencyBalance = {
  currency: string;
  /** Net balance in the currency itself. */
  balance: Decimal;
  /** That balance valued in the group base currency at today's FX rate. */
  baseValue: Decimal;
};

export type CashVehicleBalance = {
  key: string;
  kind: CashVehicleKind;
  label: string;
  accountType: string | null;
  sourceAccountKey: string | null;
  currency: string;
  balance: Decimal;
  baseValue: Decimal;
  realizedIncomeBase: Decimal;
};

export type GroupCash = {
  groupId: string;
  baseCurrency: string;
  /** Total cash and cash-like investments in base currency, valued at today's FX rate. */
  currentCash: Decimal;
  /** Plain cash only, excluding HISA / yield-bearing cash vehicles. */
  pureCash: Decimal;
  /** HISA / yield-bearing cash vehicles, valued at today's FX rate. */
  cashInvestments: Decimal;
  /** Per-currency balances (current-rate valuation). */
  byCurrency: CurrencyBalance[];
  /** Per-currency balances split by cash vehicle. */
  byVehicle: CashVehicleBalance[];
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
  cashTransactions: {
    orderBy: { date: "asc" as const },
    include: {
      statementImport: {
        select: {
          accountType: true,
          provider: true,
          accountLast4: true,
          sourceAccountKey: true,
        },
      },
    },
  },
  cashStatementImports: {
    select: {
      sourceAccountKey: true,
      accountType: true,
    },
  },
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
  const accountTypeBySourceAccount = new Map<string, string>();
  for (const statementImport of group.cashStatementImports) {
    if (!statementImport.accountType) continue;
    accountTypeBySourceAccount.set(
      statementImport.sourceAccountKey,
      statementImport.accountType,
    );
  }

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
    const accountType =
      ct.statementImport?.accountType ??
      (ct.sourceAccountKey
        ? accountTypeBySourceAccount.get(ct.sourceAccountKey)
        : null) ??
      null;
    const vehicleKind = classifyExternalCashAccountKind(accountType);
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
      accountType,
      vehicleKind,
      vehicleLabel: cashVehicleLabel(vehicleKind, accountType),
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
          accountType: null,
          vehicleKind: "CASH",
          vehicleLabel: cashVehicleLabel("CASH", null),
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
          accountType: null,
          vehicleKind: "CASH",
          vehicleLabel: cashVehicleLabel("CASH", null),
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

  const byVehicle = await cashVehicleBalances(ledger, base, now);
  const pureCash = byVehicle
    .filter((v) => v.kind === "CASH")
    .reduce((sum, v) => sum.plus(v.baseValue), ZERO);
  const cashInvestments = byVehicle
    .filter((v) => v.kind === "HISA")
    .reduce((sum, v) => sum.plus(v.baseValue), ZERO);

  return {
    groupId,
    baseCurrency: base,
    currentCash,
    pureCash,
    cashInvestments,
    byCurrency,
    byVehicle,
    seededAndDeposits: agg.seededAndDeposits,
    withdrawals: agg.withdrawals,
    tradeOutflows: agg.tradeOutflows,
    tradeInflows: agg.tradeInflows,
    realizedIncome: agg.realizedIncome,
    ledger,
  };
}

async function cashVehicleBalances(
  ledger: CashLedgerEntry[],
  baseCurrency: string,
  asOf: Date,
): Promise<CashVehicleBalance[]> {
  const map = new Map<
    string,
    {
      kind: CashVehicleKind;
      label: string;
      accountType: string | null;
      sourceAccountKey: string | null;
      currency: string;
      balance: Decimal;
      realizedIncomeBase: Decimal;
    }
  >();

  for (const e of ledger) {
    const currency = e.currency.toUpperCase();
    const sourceKey = e.sourceAccountKey ?? "manual";
    const key = `${e.vehicleKind}:${sourceKey}:${currency}`;
    const existing = map.get(key);
    const realizedIncomeBase = isRealizedCashIncome(e) ? e.amountBase : ZERO;
    if (existing) {
      existing.balance = existing.balance.plus(e.amountCurrencySigned);
      existing.realizedIncomeBase =
        existing.realizedIncomeBase.plus(realizedIncomeBase);
    } else {
      map.set(key, {
        kind: e.vehicleKind,
        label: e.vehicleLabel,
        accountType: e.accountType,
        sourceAccountKey: e.sourceAccountKey,
        currency,
        balance: e.amountCurrencySigned,
        realizedIncomeBase,
      });
    }
  }

  const rows: CashVehicleBalance[] = [];
  for (const [key, row] of map) {
    if (row.balance.isZero()) continue;
    rows.push({
      key,
      kind: row.kind,
      label: row.label,
      accountType: row.accountType,
      sourceAccountKey: row.sourceAccountKey,
      currency: row.currency,
      balance: row.balance,
      baseValue: await convert(row.balance, row.currency, baseCurrency, asOf),
      realizedIncomeBase: row.realizedIncomeBase,
    });
  }
  rows.sort((a, b) => b.baseValue.abs().comparedTo(a.baseValue.abs()));
  return rows;
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

export function cashBalancesByVehicleInGroupBaseThroughUtcDay(
  ledger: CashLedgerEntry[],
  throughDay: Date,
): { pureCash: Decimal; cashInvestments: Decimal } {
  const through = utcDayKey(throughDay);
  let pureCash = ZERO;
  let cashInvestments = ZERO;
  for (const e of ledger) {
    if (utcDayKey(e.date) > through) continue;
    if (e.vehicleKind === "HISA") {
      cashInvestments = cashInvestments.plus(e.amountBase);
    } else {
      pureCash = pureCash.plus(e.amountBase);
    }
  }
  return { pureCash, cashInvestments };
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
