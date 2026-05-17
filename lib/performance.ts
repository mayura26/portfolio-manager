import Decimal from "decimal.js";
import { BENCHMARK_LABEL, getBenchmarkCloses } from "@/lib/benchmark";
import { getGroupCashLedger } from "@/lib/cash";
import {
  getGroupValueHistory,
  getPortfolioValueHistory,
  getValueHistoryByGroup,
} from "@/lib/dashboard";
import { db } from "@/lib/db";
import { convert } from "@/lib/fx";

const ONE = new Decimal(1);

export type PerformancePoint = {
  date: string;
  /** Cumulative time-weighted return %, rebased to 0 at the window start. */
  portfolio: number;
  /** Cumulative S&P 500 return %, or null before its first close. */
  benchmark: number | null;
};

export type PerformanceSeries = {
  label: string;
  benchmarkLabel: string;
  points: PerformancePoint[];
};

type Flow = { date: Date; amount: number };

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Most recent close on or before `asOf` (closes sorted ascending). */
function priceOnOrBefore(
  closes: { date: Date; close: Decimal }[],
  asOf: Date,
): Decimal | null {
  const key = dayKey(asOf);
  let result: Decimal | null = null;
  for (const c of closes) {
    if (dayKey(c.date) > key) break;
    result = c.close;
  }
  return result;
}

/**
 * Cumulative time-weighted return %, rebased to 0 at the first date. Each
 * day's sub-period return neutralizes that day's external flow, so deposits
 * and withdrawals don't masquerade as performance.
 */
function twrPercent(values: number[], flows: number[]): number[] {
  const out: number[] = [];
  let index = 1;
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      out.push(0);
      continue;
    }
    const base = values[i - 1] + flows[i];
    const r = base !== 0 ? values[i] / base - 1 : 0;
    index *= 1 + r;
    out.push(Number(((index - 1) * 100).toFixed(4)));
  }
  return out;
}

/** Assign each external flow to the curve date d[i] with d[i-1] < flow <= d[i]. */
function bucketFlows(dates: Date[], flows: Flow[]): number[] {
  const out = new Array<number>(dates.length).fill(0);
  if (dates.length === 0) return out;
  const keys = dates.map(dayKey);
  for (const f of flows) {
    const fk = dayKey(f.date);
    let idx = -1;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] >= fk) {
        idx = i;
        break;
      }
    }
    // idx <= 0: flow is on/before the window start — already baked into v[0].
    if (idx > 0) out[idx] += f.amount;
  }
  return out;
}

/** S&P 500 cumulative return %, rebased to 0 at the window's first date. */
function benchmarkPercent(
  dates: Date[],
  closes: { date: Date; close: Decimal }[],
): (number | null)[] {
  if (dates.length === 0) return [];
  const anchor = priceOnOrBefore(closes, dates[0]);
  if (!anchor || anchor.isZero()) return dates.map(() => null);
  return dates.map((d) => {
    const c = priceOnOrBefore(closes, d);
    if (!c) return null;
    return Number(c.dividedBy(anchor).minus(1).times(100).toFixed(4));
  });
}

async function buildSeries(
  label: string,
  dates: Date[],
  values: number[],
  flows: Flow[],
): Promise<PerformanceSeries> {
  if (dates.length < 2) {
    return { label, benchmarkLabel: BENCHMARK_LABEL, points: [] };
  }

  const portfolioPct = twrPercent(values, bucketFlows(dates, flows));

  // Fetch a few days before the window so the benchmark has a close to
  // anchor on at the very first date.
  const since = new Date(dates[0]);
  since.setUTCDate(since.getUTCDate() - 7);
  const closes = await getBenchmarkCloses(since);
  const benchPct = benchmarkPercent(dates, closes);

  const points: PerformancePoint[] = dates.map((d, i) => ({
    date: d.toISOString(),
    portfolio: portfolioPct[i],
    benchmark: benchPct[i],
  }));
  return { label, benchmarkLabel: BENCHMARK_LABEL, points };
}

/** Sum every numeric series key in a value-history row. */
function rowTotal(
  row: Record<string, number>,
  series: { key: string }[],
): number {
  let total = 0;
  for (const s of series) {
    const v = row[s.key];
    if (typeof v === "number") total += v;
  }
  return total;
}

/** Time-weighted return of one portfolio vs the S&P 500. Trades are flows. */
export async function getPortfolioPerformance(
  portfolioId: string,
  days = 90,
): Promise<PerformanceSeries> {
  const portfolio = await db.portfolio.findUnique({
    where: { id: portfolioId },
    select: { name: true, baseCurrency: true },
  });
  const history = await getPortfolioValueHistory(portfolioId, days);
  const dates = history.points.map((p) => p.date);
  const values = history.points.map((p) => p.equities);

  const base = portfolio?.baseCurrency ?? history.baseCurrency;
  const trades = await db.trade.findMany({
    where: { portfolioId },
    orderBy: { date: "asc" },
    select: {
      date: true,
      type: true,
      quantity: true,
      price: true,
      fees: true,
      currency: true,
      fxRate: true,
    },
  });
  const flows: Flow[] = trades.map((t) => {
    const tradeFx =
      t.currency === base
        ? ONE
        : t.fxRate != null
          ? new Decimal(t.fxRate.toString())
          : ONE;
    const gross = new Decimal(t.price.toString())
      .times(t.quantity.toString())
      .times(tradeFx);
    const fees = new Decimal(t.fees.toString()).times(tradeFx);
    const amount =
      t.type === "BUY" ? gross.plus(fees) : gross.minus(fees).negated();
    return { date: t.date, amount: Number(amount) };
  });

  return buildSeries(portfolio?.name ?? "Portfolio", dates, values, flows);
}

/** Time-weighted return of a group vs the S&P 500. Deposits/withdrawals are flows. */
export async function getGroupPerformance(
  groupId: string,
  days = 90,
): Promise<PerformanceSeries> {
  const group = await db.portfolioGroup.findUnique({
    where: { id: groupId },
    select: { name: true },
  });
  const history = await getGroupValueHistory(groupId, days);
  const dates = history.points.map((p) => p.date);
  const values = history.points.map((row) => rowTotal(row, history.series));

  const { ledger } = await getGroupCashLedger(groupId);
  const flows: Flow[] = ledger
    .filter((e) => e.kind === "transaction" && e.type !== "DIVIDEND")
    .map((e) => ({ date: e.date, amount: Number(e.amountBase) }));

  return buildSeries(group?.name ?? "Group", dates, values, flows);
}

/** Time-weighted return of the whole account vs the S&P 500. */
export async function getAccountPerformance(
  days = 90,
): Promise<PerformanceSeries> {
  const history = await getValueHistoryByGroup(days);
  const dates = history.points.map((p) => p.date);
  const values = history.points.map((row) => rowTotal(row, history.series));

  const globalBase = history.baseCurrency;
  const groups = await db.portfolioGroup.findMany({ select: { id: true } });
  const flows: Flow[] = [];
  for (const g of groups) {
    const { baseCurrency, ledger } = await getGroupCashLedger(g.id);
    for (const e of ledger) {
      if (e.kind !== "transaction" || e.type === "DIVIDEND") continue;
      const amount =
        baseCurrency === globalBase
          ? e.amountBase
          : await convert(e.amountBase, baseCurrency, globalBase, e.date);
      flows.push({ date: e.date, amount: Number(amount) });
    }
  }

  return buildSeries("Whole portfolio", dates, values, flows);
}
