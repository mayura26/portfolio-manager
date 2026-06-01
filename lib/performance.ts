import Decimal from "decimal.js";
import { BENCHMARK_LABEL, getBenchmarkCloses } from "@/lib/benchmark";
import { getGroupCashLedger, isExternalCashFlow } from "@/lib/cash";
import { getGroupValueHistory, getValueHistoryByGroup } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { convert } from "@/lib/fx";
import { visibleTradeWhere } from "@/lib/portfolio-visibility";

const BENCHMARK_KEY = "benchmark";

export type PerformanceLine = {
  key: string;
  label: string;
  /** "benchmark" renders as a dashed reference line; "entity" is a solid line. */
  kind: "entity" | "benchmark";
};

export type PerformancePoint = Record<string, string | number | null>;

export type PerformanceData = {
  lines: PerformanceLine[];
  points: PerformancePoint[];
};

type Flow = { date: Date; amount: number };

export type ReturnPeriodKey = "day" | "week" | "month";

export type ReturnPeriods = Record<ReturnPeriodKey, number | null>;

type EntityInput = {
  key: string;
  label: string;
  /** Total value per curve date. */
  values: number[];
  /** External flows (dated); bucketed onto the curve internally. */
  flows: Flow[];
};

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
 * and withdrawals (or trades, for a portfolio) don't masquerade as performance.
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

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function anchorIndexForPeriod(dates: Date[], latest: Date, days: number) {
  const targetKey = dayKey(addUtcDays(latest, -days));
  let anchorIndex = -1;
  for (let i = 0; i < dates.length; i++) {
    if (dayKey(dates[i]) <= targetKey) {
      anchorIndex = i;
    } else {
      break;
    }
  }
  return anchorIndex;
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

async function buildPerformance(
  dates: Date[],
  entities: EntityInput[],
): Promise<PerformanceData> {
  if (dates.length < 2 || entities.length === 0) {
    return { lines: [], points: [] };
  }

  // Fetch a few days before the window so the benchmark has a close to
  // anchor on at the very first date.
  const since = new Date(dates[0]);
  since.setUTCDate(since.getUTCDate() - 7);
  const closes = await getBenchmarkCloses(since);
  const benchPct = benchmarkPercent(dates, closes);

  const entityPct = entities.map((e) => ({
    key: e.key,
    pct: twrPercent(e.values, bucketFlows(dates, e.flows)),
  }));

  const points: PerformancePoint[] = dates.map((d, i) => {
    const row: PerformancePoint = { date: d.toISOString() };
    for (const e of entityPct) row[e.key] = e.pct[i];
    row[BENCHMARK_KEY] = benchPct[i];
    return row;
  });

  const lines: PerformanceLine[] = [
    ...entities.map((e) => ({
      key: e.key,
      label: e.label,
      kind: "entity" as const,
    })),
    { key: BENCHMARK_KEY, label: BENCHMARK_LABEL, kind: "benchmark" as const },
  ];

  return { lines, points };
}

/** Time-weighted return of a group as a whole vs the S&P 500. */
export async function getGroupPerformance(
  groupId: string,
  days = 90,
): Promise<PerformanceData> {
  const group = await db.portfolioGroup.findUnique({
    where: { id: groupId },
    select: { name: true },
  });
  const history = await getGroupValueHistory(groupId, days);
  const dates = history.points.map((p) => p.date);
  if (dates.length < 2) return { lines: [], points: [] };

  const values = history.points.map((row) => rowTotal(row, history.series));

  const { ledger } = await getGroupCashLedger(groupId);
  const flows: Flow[] = ledger
    .filter(isExternalCashFlow)
    .map((e) => ({ date: e.date, amount: Number(e.amountBase) }));

  return buildPerformance(dates, [
    { key: "group", label: group?.name ?? "Group", values, flows },
  ]);
}

/** Per-portfolio trade flows for a group, in the group's base currency. */
async function groupTradeFlows(
  groupId: string,
  groupBase: string,
): Promise<Map<string, Flow[]>> {
  const trades = await db.trade.findMany({
    where: { ...visibleTradeWhere, portfolio: { groupId } },
    orderBy: { date: "asc" },
    select: {
      portfolioId: true,
      date: true,
      type: true,
      quantity: true,
      price: true,
      fees: true,
      currency: true,
    },
  });
  const byPortfolio = new Map<string, Flow[]>();
  for (const t of trades) {
    const gross = new Decimal(t.price.toString()).times(t.quantity.toString());
    const fees = new Decimal(t.fees.toString());
    const grossBase =
      t.currency === groupBase
        ? gross
        : await convert(gross, t.currency, groupBase, t.date);
    const feesBase =
      t.currency === groupBase
        ? fees
        : await convert(fees, t.currency, groupBase, t.date);
    const amount =
      t.type === "BUY"
        ? grossBase.plus(feesBase)
        : grossBase.minus(feesBase).negated();
    let arr = byPortfolio.get(t.portfolioId);
    if (!arr) {
      arr = [];
      byPortfolio.set(t.portfolioId, arr);
    }
    arr.push({ date: t.date, amount: Number(amount) });
  }
  return byPortfolio;
}

/**
 * Final cumulative time-weighted return % per portfolio in a group, keyed by
 * portfolio id. A portfolio's own trades are treated as its external flows.
 */
export async function getGroupPortfolioReturns(
  groupId: string,
  days = 90,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const history = await getGroupValueHistory(groupId, days);
  const dates = history.points.map((p) => p.date);
  if (dates.length < 2) return result;

  const portfolioSeries = history.series.filter((s) => s.key.startsWith("p_"));
  const flowsByPortfolio = await groupTradeFlows(groupId, history.baseCurrency);

  for (const s of portfolioSeries) {
    const portfolioId = s.key.slice(2);
    const values = history.points.map((row) => {
      const v = row[s.key];
      return typeof v === "number" ? v : 0;
    });
    if (!values.some((v) => v !== 0)) continue;
    const pct = twrPercent(
      values,
      bucketFlows(dates, flowsByPortfolio.get(portfolioId) ?? []),
    );
    result.set(portfolioId, pct[pct.length - 1]);
  }
  return result;
}

/**
 * Final cumulative time-weighted return % for each portfolio across the
 * short periods used by the group performance table.
 */
export async function getGroupPortfolioReturnPeriods(
  groupId: string,
): Promise<Map<string, ReturnPeriods>> {
  const result = new Map<string, ReturnPeriods>();
  const periods: Array<{ key: ReturnPeriodKey; days: number }> = [
    { key: "day", days: 1 },
    { key: "week", days: 7 },
    { key: "month", days: 30 },
  ];
  const maxDays = Math.max(...periods.map((p) => p.days));
  const history = await getGroupValueHistory(groupId, maxDays + 10);
  const dates = history.points.map((p) => p.date);
  if (dates.length < 2) return result;

  const latest = dates[dates.length - 1];
  const portfolioSeries = history.series.filter((s) => s.key.startsWith("p_"));
  const flowsByPortfolio = await groupTradeFlows(groupId, history.baseCurrency);

  for (const s of portfolioSeries) {
    const portfolioId = s.key.slice(2);
    const values = history.points.map((row) => {
      const v = row[s.key];
      return typeof v === "number" ? v : 0;
    });
    if (!values.some((v) => v !== 0)) continue;

    const portfolioPeriods: ReturnPeriods = {
      day: null,
      week: null,
      month: null,
    };

    for (const period of periods) {
      const anchorIndex = anchorIndexForPeriod(dates, latest, period.days);
      if (anchorIndex < 0 || anchorIndex >= dates.length - 1) continue;
      if (values[anchorIndex] <= 0) continue;

      const windowDates = dates.slice(anchorIndex);
      const windowValues = values.slice(anchorIndex);
      const pct = twrPercent(
        windowValues,
        bucketFlows(windowDates, flowsByPortfolio.get(portfolioId) ?? []),
      );
      portfolioPeriods[period.key] = pct[pct.length - 1] ?? null;
    }

    result.set(portfolioId, portfolioPeriods);
  }

  return result;
}

/** Time-weighted return of the whole account vs the S&P 500. */
export async function getAccountPerformance(
  days = 90,
): Promise<PerformanceData> {
  const history = await getValueHistoryByGroup(days);
  const dates = history.points.map((p) => p.date);
  if (dates.length < 2) return { lines: [], points: [] };

  const values = history.points.map((row) => rowTotal(row, history.series));

  const globalBase = history.baseCurrency;
  const groups = await db.portfolioGroup.findMany({ select: { id: true } });
  const flows: Flow[] = [];
  for (const g of groups) {
    const { baseCurrency, ledger } = await getGroupCashLedger(g.id);
    for (const e of ledger) {
      if (!isExternalCashFlow(e)) continue;
      const amount =
        baseCurrency === globalBase
          ? e.amountBase
          : await convert(e.amountBase, baseCurrency, globalBase, e.date);
      flows.push({ date: e.date, amount: Number(amount) });
    }
  }

  return buildPerformance(dates, [
    { key: "account", label: "Whole portfolio", values, flows },
  ]);
}
