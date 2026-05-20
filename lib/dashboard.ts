import Decimal from "decimal.js";
import { getSettings } from "@/actions/settings";
import {
  cashBalanceInGroupBaseThroughUtcDay,
  computeGroupCash,
  getGroupCashLedger,
} from "@/lib/cash";
import { db } from "@/lib/db";
import { convert, getFxRate } from "@/lib/fx";
import {
  computeFifoOpenCostBasis,
  computeHoldings,
  type FifoCostTradeInput,
  type Holding,
} from "@/lib/holdings";
import {
  excludeEmptyUnassignedWhere,
  visibleTradeWhere,
} from "@/lib/portfolio-visibility";

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

export type GroupPnlRow = {
  groupId: string;
  name: string;
  unrealized: Decimal;
  dailyChange: Decimal;
  realized: Decimal;
};

export type DashboardSummary = {
  baseCurrency: string;
  portfolioCount: number;
  holdingCount: number;
  totalCostBase: Decimal;
  totalMarketValueBase: Decimal;
  totalCashBase: Decimal;
  totalUnrealizedPnL: Decimal;
  totalRealizedPnL: Decimal;
  totalDailyChange: Decimal;
  totalDailyChangePercent: Decimal | null;
  hasMissingPrices: boolean;
  /** Per-group P&L, sorted by group name. */
  groupBreakdown: GroupPnlRow[];
};

export type AllocationSlice = {
  key: string;
  label: string;
  value: Decimal;
  percent: Decimal;
};

export type AllocationGroupBy = "portfolio" | "sector" | "currency";

export type TopMover = {
  instrumentId: string;
  symbol: string;
  name: string;
  marketValueBase: Decimal;
  changePercent: Decimal;
  changeAmount: Decimal;
};

export type ValueHistoryStackedPoint = {
  date: Date;
  equities: number;
  cash: number;
  /** Portfolio charts: FIFO cost of open lots (portfolio base currency). */
  costBasis?: number;
};

export type GroupValueHistorySeries = {
  key: string;
  label: string;
  /** Index of the owning group; drives a stable color in the chart. */
  groupIndex?: number;
  /** Visual treatment: equities band or cash band. */
  variant?: "equities" | "cash";
};

type EnrichedHolding = Holding & {
  portfolioId: string;
  portfolioName: string;
  marketValueGlobal: Decimal | null;
  costGlobal: Decimal;
  unrealizedGlobal: Decimal | null;
  realizedGlobal: Decimal;
  dailyChangeGlobal: Decimal | null;
  dailyChangePercent: Decimal | null;
  yesterdayPrice: Decimal | null;
};

type DashboardWorkingSet = {
  baseCurrency: string;
  portfolios: {
    id: string;
    name: string;
    baseCurrency: string;
    groupId: string;
    groupName: string;
  }[];
  enriched: EnrichedHolding[];
  totalRealizedGlobal: Decimal;
  /** Realized P&L per portfolio id, converted to the global base currency. */
  realizedByPortfolio: Map<string, Decimal>;
  hasMissingPrices: boolean;
};

async function buildWorkingSet(): Promise<DashboardWorkingSet> {
  const [settings, portfolios] = await Promise.all([
    getSettings(),
    db.portfolio.findMany({
      where: excludeEmptyUnassignedWhere,
      select: {
        id: true,
        name: true,
        baseCurrency: true,
        groupId: true,
        group: { select: { name: true } },
      },
    }),
  ]);

  const baseCurrency = settings.defaultBaseCurrency;
  const enriched: EnrichedHolding[] = [];
  const realizedByPortfolio = new Map<string, Decimal>();
  let totalRealizedGlobal = ZERO;
  let hasMissingPrices = false;

  for (const portfolio of portfolios) {
    const data = await computeHoldings(portfolio.id);
    if (data.hasMissingPrices) hasMissingPrices = true;

    const portfolioToGlobal =
      portfolio.baseCurrency === baseCurrency
        ? ONE
        : await getFxRate(portfolio.baseCurrency, baseCurrency);

    const realizedGlobal = data.totalRealizedPnL.times(portfolioToGlobal);
    totalRealizedGlobal = totalRealizedGlobal.plus(realizedGlobal);
    realizedByPortfolio.set(portfolio.id, realizedGlobal);

    for (const h of data.holdings) {
      const costGlobal = h.costBase.times(portfolioToGlobal);
      const realizedGlobal = h.realizedPnL.times(portfolioToGlobal);
      const marketValueGlobal = h.marketValueBase
        ? h.marketValueBase.times(portfolioToGlobal)
        : null;
      const unrealizedGlobal = h.unrealizedPnL
        ? h.unrealizedPnL.times(portfolioToGlobal)
        : null;

      const yesterday = await loadPreviousClose(h.instrumentId, h.priceAsOf);
      let dailyChangeGlobal: Decimal | null = null;
      let dailyChangePercent: Decimal | null = null;
      if (h.marketPrice && yesterday) {
        const priceDelta = h.marketPrice.minus(yesterday);
        const instrumentToGlobal =
          h.currency === baseCurrency
            ? ONE
            : await getFxRate(h.currency, baseCurrency);
        dailyChangeGlobal = priceDelta
          .times(h.quantity)
          .times(instrumentToGlobal);
        dailyChangePercent = yesterday.isZero()
          ? null
          : priceDelta.dividedBy(yesterday).times(100);
      }

      enriched.push({
        ...h,
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        marketValueGlobal,
        costGlobal,
        unrealizedGlobal,
        realizedGlobal,
        dailyChangeGlobal,
        dailyChangePercent,
        yesterdayPrice: yesterday,
      });
    }
  }

  return {
    baseCurrency,
    portfolios: portfolios.map((p) => ({
      id: p.id,
      name: p.name,
      baseCurrency: p.baseCurrency,
      groupId: p.groupId,
      groupName: p.group.name,
    })),
    enriched,
    totalRealizedGlobal,
    realizedByPortfolio,
    hasMissingPrices,
  };
}

async function loadPreviousClose(
  instrumentId: string,
  latestDate: Date | null,
): Promise<Decimal | null> {
  if (!latestDate) return null;
  const prev = await db.priceHistory.findFirst({
    where: { instrumentId, date: { lt: latestDate } },
    orderBy: { date: "desc" },
  });
  if (!prev) return null;
  return new Decimal(prev.close.toString());
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const ws = await buildWorkingSet();

  let totalCostBase = ZERO;
  let totalMarketValueBase = ZERO;
  let totalDailyChange = ZERO;
  let canComputeDaily = true;

  const portfolioToGroup = new Map(
    ws.portfolios.map((p) => [p.id, { id: p.groupId, name: p.groupName }]),
  );
  type GroupAcc = {
    name: string;
    cost: Decimal;
    marketValue: Decimal;
    dailyChange: Decimal;
    realized: Decimal;
  };
  const groupAcc = new Map<string, GroupAcc>();
  const ensureGroup = (id: string, name: string): GroupAcc => {
    let acc = groupAcc.get(id);
    if (!acc) {
      acc = {
        name,
        cost: ZERO,
        marketValue: ZERO,
        dailyChange: ZERO,
        realized: ZERO,
      };
      groupAcc.set(id, acc);
    }
    return acc;
  };

  for (const h of ws.enriched) {
    totalCostBase = totalCostBase.plus(h.costGlobal);
    if (h.marketValueGlobal)
      totalMarketValueBase = totalMarketValueBase.plus(h.marketValueGlobal);
    if (h.dailyChangeGlobal) {
      totalDailyChange = totalDailyChange.plus(h.dailyChangeGlobal);
    } else {
      canComputeDaily = false;
    }

    const group = portfolioToGroup.get(h.portfolioId);
    if (group) {
      const acc = ensureGroup(group.id, group.name);
      acc.cost = acc.cost.plus(h.costGlobal);
      if (h.marketValueGlobal)
        acc.marketValue = acc.marketValue.plus(h.marketValueGlobal);
      if (h.dailyChangeGlobal)
        acc.dailyChange = acc.dailyChange.plus(h.dailyChangeGlobal);
    }
  }

  for (const [portfolioId, realized] of ws.realizedByPortfolio) {
    const group = portfolioToGroup.get(portfolioId);
    if (!group) continue;
    const acc = ensureGroup(group.id, group.name);
    acc.realized = acc.realized.plus(realized);
  }

  const groupBreakdown: GroupPnlRow[] = Array.from(groupAcc.entries())
    .map(([groupId, acc]) => ({
      groupId,
      name: acc.name,
      unrealized: acc.marketValue.minus(acc.cost),
      dailyChange: acc.dailyChange,
      realized: acc.realized,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalUnrealizedPnL = totalMarketValueBase.minus(totalCostBase);
  const previousValue = totalMarketValueBase.minus(totalDailyChange);
  const totalDailyChangePercent =
    canComputeDaily && previousValue.gt(0)
      ? totalDailyChange.dividedBy(previousValue).times(100)
      : null;

  const groups = await db.portfolioGroup.findMany({ select: { id: true } });
  const now = new Date();
  let totalCashBase = ZERO;
  for (const g of groups) {
    const cash = await computeGroupCash(g.id);
    if (cash.currentCash.isZero()) continue;
    totalCashBase = totalCashBase.plus(
      await convert(cash.currentCash, cash.baseCurrency, ws.baseCurrency, now),
    );
  }

  return {
    baseCurrency: ws.baseCurrency,
    portfolioCount: ws.portfolios.length,
    holdingCount: ws.enriched.length,
    totalCostBase,
    totalMarketValueBase,
    totalCashBase,
    totalUnrealizedPnL,
    totalRealizedPnL: ws.totalRealizedGlobal,
    totalDailyChange: canComputeDaily ? totalDailyChange : ZERO,
    totalDailyChangePercent,
    hasMissingPrices: ws.hasMissingPrices,
    groupBreakdown,
  };
}

export async function getAllocation(
  groupBy: AllocationGroupBy = "portfolio",
): Promise<{
  baseCurrency: string;
  total: Decimal;
  slices: AllocationSlice[];
}> {
  const ws = await buildWorkingSet();
  const buckets = new Map<string, { label: string; value: Decimal }>();
  let total = ZERO;

  for (const h of ws.enriched) {
    if (!h.marketValueGlobal) continue;
    let key: string;
    let label: string;
    switch (groupBy) {
      case "sector":
        key = h.sector ?? "Unclassified";
        label = key;
        break;
      case "currency":
        key = h.currency;
        label = h.currency;
        break;
      default:
        key = h.portfolioId;
        label = h.portfolioName;
    }
    const existing = buckets.get(key);
    if (existing) {
      existing.value = existing.value.plus(h.marketValueGlobal);
    } else {
      buckets.set(key, { label, value: h.marketValueGlobal });
    }
    total = total.plus(h.marketValueGlobal);
  }

  const slices: AllocationSlice[] = Array.from(buckets.entries()).map(
    ([key, b]) => ({
      key,
      label: b.label,
      value: b.value,
      percent: total.gt(0) ? b.value.dividedBy(total).times(100) : ZERO,
    }),
  );

  slices.sort((a, b) => b.value.comparedTo(a.value));

  return { baseCurrency: ws.baseCurrency, total, slices };
}

export async function getTopMovers(limit = 5): Promise<{
  baseCurrency: string;
  movers: TopMover[];
}> {
  const ws = await buildWorkingSet();
  const movers: TopMover[] = ws.enriched
    .filter(
      (
        h,
      ): h is EnrichedHolding & {
        marketValueGlobal: Decimal;
        dailyChangeGlobal: Decimal;
        dailyChangePercent: Decimal;
      } =>
        !!h.marketValueGlobal &&
        !!h.dailyChangeGlobal &&
        !!h.dailyChangePercent,
    )
    .map((h) => ({
      instrumentId: h.instrumentId,
      symbol: h.symbol,
      name: h.name,
      marketValueBase: h.marketValueGlobal,
      changePercent: h.dailyChangePercent,
      changeAmount: h.dailyChangeGlobal,
    }));

  movers.sort((a, b) =>
    b.changePercent.abs().comparedTo(a.changePercent.abs()),
  );

  return { baseCurrency: ws.baseCurrency, movers: movers.slice(0, limit) };
}

export async function getValueHistoryByGroup(days = 90): Promise<{
  baseCurrency: string;
  series: GroupValueHistorySeries[];
  points: Array<{ date: Date } & Record<string, number>>;
}> {
  const settings = await getSettings();
  const baseCurrency = settings.defaultBaseCurrency;

  const groups = await db.portfolioGroup.findMany({
    select: { id: true, name: true, baseCurrency: true },
    orderBy: { name: "asc" },
  });
  if (groups.length === 0) return { baseCurrency, series: [], points: [] };

  const trades = await db.trade.findMany({
    where: visibleTradeWhere,
    orderBy: { date: "asc" },
    include: {
      instrument: true,
      portfolio: { select: { groupId: true } },
    },
  });
  if (trades.length === 0) return { baseCurrency, series: [], points: [] };

  const tradesByGroup = new Map<string, typeof trades>();
  for (const t of trades) {
    const gid = t.portfolio.groupId;
    let arr = tradesByGroup.get(gid);
    if (!arr) {
      arr = [];
      tradesByGroup.set(gid, arr);
    }
    arr.push(t);
  }

  const earliestTrade = trades[0].date;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);
  const startDate = earliestTrade > since ? earliestTrade : since;

  const instrumentIds = Array.from(new Set(trades.map((t) => t.instrumentId)));
  const prices = await db.priceHistory.findMany({
    where: { instrumentId: { in: instrumentIds }, date: { gte: startDate } },
    orderBy: [{ instrumentId: "asc" }, { date: "asc" }],
  });

  const pricesByInstrument = new Map<
    string,
    { date: Date; close: Decimal }[]
  >();
  for (const p of prices) {
    let arr = pricesByInstrument.get(p.instrumentId);
    if (!arr) {
      arr = [];
      pricesByInstrument.set(p.instrumentId, arr);
    }
    arr.push({ date: p.date, close: new Decimal(p.close.toString()) });
  }

  const dates = uniqueSortedDates(
    prices.map((p) => p.date),
    startDate,
  );
  if (dates.length === 0) return { baseCurrency, series: [], points: [] };

  const fxCache = new Map<string, Decimal>();
  async function fxOn(from: string, to: string, asOf: Date): Promise<Decimal> {
    if (from === to) return ONE;
    const key = `${from}-${to}-${asOf.toISOString().slice(0, 10)}`;
    const cached = fxCache.get(key);
    if (cached) return cached;
    const rate = await getFxRate(from, to, asOf);
    fxCache.set(key, rate);
    return rate;
  }

  const ledgers = new Map<
    string,
    Awaited<ReturnType<typeof getGroupCashLedger>>
  >();
  await Promise.all(
    groups.map(async (g) => {
      ledgers.set(g.id, await getGroupCashLedger(g.id));
    }),
  );

  const points: Array<{ date: Date } & Record<string, number>> = [];
  for (const day of dates) {
    const row = { date: day } as { date: Date } & Record<string, number>;
    for (const g of groups) {
      const gTrades = tradesByGroup.get(g.id) ?? [];
      const instSet = Array.from(new Set(gTrades.map((t) => t.instrumentId)));
      let equity = ZERO;
      for (const instrumentId of instSet) {
        const qty = quantityHeldOn(gTrades, instrumentId, day);
        if (qty.isZero()) continue;
        const close = priceOn(pricesByInstrument.get(instrumentId), day);
        if (!close) continue;
        const tr = gTrades.find((t) => t.instrumentId === instrumentId);
        if (!tr) continue;
        const fx = await fxOn(tr.instrument.currency, baseCurrency, day);
        equity = equity.plus(qty.times(close).times(fx));
      }

      let cash = ZERO;
      const gl = ledgers.get(g.id);
      if (gl) {
        const bal = cashBalanceInGroupBaseThroughUtcDay(gl.ledger, day);
        if (!bal.isZero()) {
          cash = await convert(bal, gl.baseCurrency, baseCurrency, day);
        }
      }

      row[`g_${g.id}_eq`] = Number(equity.toFixed(2));
      row[`g_${g.id}_cash`] = Number(cash.toFixed(2));
    }
    points.push(row);
  }

  const activeGroups = groups.filter((g) =>
    points.some(
      (row) =>
        (row[`g_${g.id}_eq`] ?? 0) !== 0 || (row[`g_${g.id}_cash`] ?? 0) !== 0,
    ),
  );
  const series: GroupValueHistorySeries[] = [];
  activeGroups.forEach((g, gi) => {
    series.push({
      key: `g_${g.id}_eq`,
      label: `${g.name} — Equities`,
      groupIndex: gi,
      variant: "equities",
    });
    series.push({
      key: `g_${g.id}_cash`,
      label: `${g.name} — Cash`,
      groupIndex: gi,
      variant: "cash",
    });
  });

  return { baseCurrency, series, points };
}

type TradeForEquityCurve = {
  date: Date;
  instrumentId: string;
  portfolioId: string;
  type: "BUY" | "SELL";
  quantity: { toString(): string };
  instrument: { currency: string };
};

async function buildEquityHistoryCurve(
  trades: TradeForEquityCurve[],
  days: number,
  targetBaseCurrency: string,
): Promise<{ dates: Date[]; equities: Decimal[] } | null> {
  if (trades.length === 0) return null;

  const earliestTrade = trades[0].date;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);
  const startDate = earliestTrade > since ? earliestTrade : since;

  const instrumentIds = Array.from(new Set(trades.map((t) => t.instrumentId)));
  const prices = await db.priceHistory.findMany({
    where: { instrumentId: { in: instrumentIds }, date: { gte: startDate } },
    orderBy: [{ instrumentId: "asc" }, { date: "asc" }],
  });

  const pricesByInstrument = new Map<
    string,
    { date: Date; close: Decimal }[]
  >();
  for (const p of prices) {
    let arr = pricesByInstrument.get(p.instrumentId);
    if (!arr) {
      arr = [];
      pricesByInstrument.set(p.instrumentId, arr);
    }
    arr.push({ date: p.date, close: new Decimal(p.close.toString()) });
  }

  const dates = uniqueSortedDates(
    prices.map((p) => p.date),
    startDate,
  );
  if (dates.length === 0) return null;

  const fxCache = new Map<string, Decimal>();
  async function fxOn(from: string, to: string, asOf: Date): Promise<Decimal> {
    if (from === to) return ONE;
    const key = `${from}-${to}-${asOf.toISOString().slice(0, 10)}`;
    const cached = fxCache.get(key);
    if (cached) return cached;
    const rate = await getFxRate(from, to, asOf);
    fxCache.set(key, rate);
    return rate;
  }

  const equities: Decimal[] = [];
  for (const day of dates) {
    let dayValue = ZERO;
    for (const instrumentId of instrumentIds) {
      const qty = quantityHeldOn(trades, instrumentId, day);
      if (qty.isZero()) continue;
      const close = priceOn(pricesByInstrument.get(instrumentId), day);
      if (!close) continue;
      const trade = trades.find((t) => t.instrumentId === instrumentId);
      if (!trade) continue;
      const fx = await fxOn(trade.instrument.currency, targetBaseCurrency, day);
      dayValue = dayValue.plus(qty.times(close).times(fx));
    }
    equities.push(dayValue);
  }

  return { dates, equities };
}

export async function getPortfolioValueHistory(
  portfolioId: string,
  days = 90,
): Promise<{
  baseCurrency: string;
  points: ValueHistoryStackedPoint[];
}> {
  const portfolio = await db.portfolio.findUnique({
    where: { id: portfolioId },
    select: { baseCurrency: true },
  });
  if (!portfolio) return { baseCurrency: "USD", points: [] };

  const trades = await db.trade.findMany({
    where: { portfolioId, ...visibleTradeWhere },
    orderBy: { date: "asc" },
    include: {
      instrument: true,
      portfolio: { select: { baseCurrency: true } },
    },
  });

  const mapped: TradeForEquityCurve[] = trades.map((t) => ({
    date: t.date,
    instrumentId: t.instrumentId,
    portfolioId: t.portfolioId,
    type: t.type,
    quantity: t.quantity,
    instrument: t.instrument,
  }));

  const curve = await buildEquityHistoryCurve(
    mapped,
    days,
    portfolio.baseCurrency,
  );
  if (!curve) return { baseCurrency: portfolio.baseCurrency, points: [] };

  const baseCurrency = portfolio.baseCurrency;
  const points: ValueHistoryStackedPoint[] = curve.dates.map((date, i) => {
    const prefix: FifoCostTradeInput[] = [];
    for (const t of trades) {
      if (t.date.getTime() > date.getTime()) break;
      prefix.push({
        instrumentId: t.instrumentId,
        type: t.type,
        quantity: t.quantity,
        price: t.price,
        fees: t.fees,
        currency: t.currency,
        fxRate: t.fxRate,
      });
    }
    const cost = computeFifoOpenCostBasis(prefix, baseCurrency);
    return {
      date,
      equities: Number(curve.equities[i].toFixed(2)),
      cash: 0,
      costBasis: Number(cost.toFixed(2)),
    };
  });

  return { baseCurrency: portfolio.baseCurrency, points };
}

export async function getGroupValueHistory(
  groupId: string,
  days = 90,
): Promise<{
  baseCurrency: string;
  series: GroupValueHistorySeries[];
  points: Array<{ date: Date } & Record<string, number>>;
}> {
  const group = await db.portfolioGroup.findUnique({
    where: { id: groupId },
    include: {
      portfolios: {
        where: excludeEmptyUnassignedWhere,
        select: { id: true, name: true, baseCurrency: true },
      },
    },
  });
  if (!group) {
    return { baseCurrency: "USD", series: [], points: [] };
  }

  const groupBase = group.baseCurrency;
  const portfolioMeta = group.portfolios;

  const trades = await db.trade.findMany({
    where: { ...visibleTradeWhere, portfolio: { groupId } },
    orderBy: { date: "asc" },
    include: {
      instrument: true,
      portfolio: { select: { id: true, baseCurrency: true } },
    },
  });

  const mapped: TradeForEquityCurve[] = trades.map((t) => ({
    date: t.date,
    instrumentId: t.instrumentId,
    portfolioId: t.portfolioId,
    type: t.type,
    quantity: t.quantity,
    instrument: t.instrument,
  }));

  const curve = await buildEquityHistoryCurve(mapped, days, groupBase);
  const { ledger } = await getGroupCashLedger(groupId);

  if (!curve) {
    const series: GroupValueHistorySeries[] = [
      ...portfolioMeta.map((p) => ({ key: `p_${p.id}`, label: p.name })),
      { key: "cash", label: "Cash", variant: "cash" as const },
    ];
    return {
      baseCurrency: groupBase,
      series,
      points: [],
    };
  }

  const instrumentIds = Array.from(new Set(trades.map((t) => t.instrumentId)));
  const earliestTrade = trades[0]?.date ?? new Date();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);
  const startDate = earliestTrade > since ? earliestTrade : since;

  const prices = await db.priceHistory.findMany({
    where: { instrumentId: { in: instrumentIds }, date: { gte: startDate } },
    orderBy: [{ instrumentId: "asc" }, { date: "asc" }],
  });
  const pricesByInstrument = new Map<
    string,
    { date: Date; close: Decimal }[]
  >();
  for (const p of prices) {
    let arr = pricesByInstrument.get(p.instrumentId);
    if (!arr) {
      arr = [];
      pricesByInstrument.set(p.instrumentId, arr);
    }
    arr.push({ date: p.date, close: new Decimal(p.close.toString()) });
  }

  const fxCache = new Map<string, Decimal>();
  async function fxOn(from: string, to: string, asOf: Date): Promise<Decimal> {
    if (from === to) return ONE;
    const key = `${from}-${to}-${asOf.toISOString().slice(0, 10)}`;
    const cached = fxCache.get(key);
    if (cached) return cached;
    const rate = await getFxRate(from, to, asOf);
    fxCache.set(key, rate);
    return rate;
  }

  const series: GroupValueHistorySeries[] = [
    ...portfolioMeta.map((p) => ({ key: `p_${p.id}`, label: p.name })),
    { key: "cash", label: "Cash", variant: "cash" as const },
  ];

  const points: Array<{ date: Date } & Record<string, number>> = [];

  for (let i = 0; i < curve.dates.length; i++) {
    const day = curve.dates[i];
    const row = { date: day } as { date: Date } & Record<string, number>;

    for (const p of portfolioMeta) {
      const pt = mapped.filter((t) => t.portfolioId === p.id);
      const instSet = Array.from(new Set(pt.map((t) => t.instrumentId)));
      let dayValue = ZERO;
      for (const instrumentId of instSet) {
        const qty = quantityHeldOnForPortfolio(pt, instrumentId, day);
        if (qty.isZero()) continue;
        const close = priceOn(pricesByInstrument.get(instrumentId), day);
        if (!close) continue;
        const tr = pt.find((t) => t.instrumentId === instrumentId);
        if (!tr) continue;
        const fx = await fxOn(tr.instrument.currency, p.baseCurrency, day);
        dayValue = dayValue.plus(qty.times(close).times(fx));
      }
      const inGroupBase =
        p.baseCurrency.toUpperCase() === groupBase.toUpperCase()
          ? dayValue
          : await convert(dayValue, p.baseCurrency, groupBase, day);
      row[`p_${p.id}`] = Number(inGroupBase.toFixed(2));
    }

    const cashB = cashBalanceInGroupBaseThroughUtcDay(ledger, day);
    row.cash = Number(cashB.toFixed(2));

    points.push(row);
  }

  return { baseCurrency: groupBase, series, points };
}

function uniqueSortedDates(dates: Date[], from: Date): Date[] {
  const set = new Set<number>();
  for (const d of dates) {
    if (d.getTime() < from.getTime()) continue;
    const day = new Date(d);
    day.setUTCHours(0, 0, 0, 0);
    set.add(day.getTime());
  }
  return Array.from(set)
    .sort((a, b) => a - b)
    .map((t) => new Date(t));
}

/** UTC midnight of a date, as epoch ms — for day-granular trade comparisons. */
function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function quantityHeldOn(
  trades: {
    date: Date;
    instrumentId: string;
    type: "BUY" | "SELL";
    quantity: { toString(): string };
  }[],
  instrumentId: string,
  asOf: Date,
): Decimal {
  const through = utcDayStart(asOf);
  let qty = ZERO;
  for (const t of trades) {
    if (t.instrumentId !== instrumentId) continue;
    // Compare by day: a trade is held from its trade date onward, regardless
    // of the intraday time component on the stored timestamp.
    if (utcDayStart(t.date) > through) break;
    const q = new Decimal(t.quantity.toString());
    qty = t.type === "BUY" ? qty.plus(q) : qty.minus(q);
  }
  return qty;
}

function quantityHeldOnForPortfolio(
  trades: TradeForEquityCurve[],
  instrumentId: string,
  asOf: Date,
): Decimal {
  const subset = trades
    .filter((t) => t.instrumentId === instrumentId)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const through = utcDayStart(asOf);
  let qty = ZERO;
  for (const t of subset) {
    if (utcDayStart(t.date) > through) break;
    const q = new Decimal(t.quantity.toString());
    qty = t.type === "BUY" ? qty.plus(q) : qty.minus(q);
  }
  return qty;
}

function priceOn(
  series: { date: Date; close: Decimal }[] | undefined,
  asOf: Date,
): Decimal | null {
  if (!series || series.length === 0) return null;
  let result: Decimal | null = null;
  for (const point of series) {
    if (point.date.getTime() > asOf.getTime()) break;
    result = point.close;
  }
  // Before an instrument's first available bar (e.g. a freshly bought holding
  // whose price history hasn't backfilled yet), fall back to the earliest
  // known price so the position isn't valued at zero — which would otherwise
  // make total value crater on the buy date and "recover" once prices arrive.
  return result ?? series[0].close;
}

export type PortfolioSummary = {
  id: string;
  name: string;
  baseCurrency: string;
  marketValue: Decimal;
  unrealizedPnL: Decimal;
  realizedPnL: Decimal;
  unrealizedPercent: Decimal | null;
};

export async function getPortfolioSummaries(): Promise<PortfolioSummary[]> {
  const portfolios = await db.portfolio.findMany({
    where: excludeEmptyUnassignedWhere,
    select: { id: true, name: true, baseCurrency: true },
    orderBy: { createdAt: "desc" },
  });

  const summaries: PortfolioSummary[] = [];
  for (const p of portfolios) {
    const data = await computeHoldings(p.id);
    summaries.push({
      id: p.id,
      name: p.name,
      baseCurrency: p.baseCurrency,
      marketValue: data.totalMarketValueBase,
      unrealizedPnL: data.totalUnrealizedPnL,
      realizedPnL: data.totalRealizedPnL,
      unrealizedPercent: data.totalCostBase.gt(0)
        ? data.totalUnrealizedPnL.dividedBy(data.totalCostBase).times(100)
        : null,
    });
  }
  return summaries;
}
