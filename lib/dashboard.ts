import Decimal from "decimal.js";
import { getSettings } from "@/actions/settings";
import { db } from "@/lib/db";
import { getFxRate } from "@/lib/fx";
import { computeHoldings, type Holding } from "@/lib/holdings";

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

export type DashboardSummary = {
  baseCurrency: string;
  portfolioCount: number;
  holdingCount: number;
  totalCostBase: Decimal;
  totalMarketValueBase: Decimal;
  totalUnrealizedPnL: Decimal;
  totalRealizedPnL: Decimal;
  totalDailyChange: Decimal;
  totalDailyChangePercent: Decimal | null;
  hasMissingPrices: boolean;
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

export type ValueHistoryPoint = {
  date: Date;
  value: number;
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
  portfolios: { id: string; name: string; baseCurrency: string }[];
  enriched: EnrichedHolding[];
  totalRealizedGlobal: Decimal;
  hasMissingPrices: boolean;
};

async function buildWorkingSet(): Promise<DashboardWorkingSet> {
  const [settings, portfolios] = await Promise.all([
    getSettings(),
    db.portfolio.findMany({
      select: { id: true, name: true, baseCurrency: true },
    }),
  ]);

  const baseCurrency = settings.defaultBaseCurrency;
  const enriched: EnrichedHolding[] = [];
  let totalRealizedGlobal = ZERO;
  let hasMissingPrices = false;

  for (const portfolio of portfolios) {
    const data = await computeHoldings(portfolio.id);
    if (data.hasMissingPrices) hasMissingPrices = true;

    const portfolioToGlobal =
      portfolio.baseCurrency === baseCurrency
        ? ONE
        : await getFxRate(portfolio.baseCurrency, baseCurrency);

    totalRealizedGlobal = totalRealizedGlobal.plus(
      data.totalRealizedPnL.times(portfolioToGlobal),
    );

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
    portfolios,
    enriched,
    totalRealizedGlobal,
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

  for (const h of ws.enriched) {
    totalCostBase = totalCostBase.plus(h.costGlobal);
    if (h.marketValueGlobal)
      totalMarketValueBase = totalMarketValueBase.plus(h.marketValueGlobal);
    if (h.dailyChangeGlobal) {
      totalDailyChange = totalDailyChange.plus(h.dailyChangeGlobal);
    } else {
      canComputeDaily = false;
    }
  }

  const totalUnrealizedPnL = totalMarketValueBase.minus(totalCostBase);
  const previousValue = totalMarketValueBase.minus(totalDailyChange);
  const totalDailyChangePercent =
    canComputeDaily && previousValue.gt(0)
      ? totalDailyChange.dividedBy(previousValue).times(100)
      : null;

  return {
    baseCurrency: ws.baseCurrency,
    portfolioCount: ws.portfolios.length,
    holdingCount: ws.enriched.length,
    totalCostBase,
    totalMarketValueBase,
    totalUnrealizedPnL,
    totalRealizedPnL: ws.totalRealizedGlobal,
    totalDailyChange: canComputeDaily ? totalDailyChange : ZERO,
    totalDailyChangePercent,
    hasMissingPrices: ws.hasMissingPrices,
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

export async function getValueHistory(days = 30): Promise<{
  baseCurrency: string;
  points: ValueHistoryPoint[];
}> {
  const settings = await getSettings();
  const baseCurrency = settings.defaultBaseCurrency;

  const trades = await db.trade.findMany({
    orderBy: { date: "asc" },
    include: {
      instrument: true,
      portfolio: { select: { baseCurrency: true } },
    },
  });

  if (trades.length === 0) return { baseCurrency, points: [] };

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

  // Build per-instrument latest-close-up-to-date lookup
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
  if (dates.length === 0) return { baseCurrency, points: [] };

  const fxCache = new Map<string, Decimal>();
  async function fxOn(from: string, to: string): Promise<Decimal> {
    if (from === to) return ONE;
    const key = `${from}-${to}`;
    const cached = fxCache.get(key);
    if (cached) return cached;
    const rate = await getFxRate(from, to);
    fxCache.set(key, rate);
    return rate;
  }

  const points: ValueHistoryPoint[] = [];
  for (const day of dates) {
    let dayValue = ZERO;
    for (const instrumentId of instrumentIds) {
      const qty = quantityHeldOn(trades, instrumentId, day);
      if (qty.isZero()) continue;
      const close = priceOn(pricesByInstrument.get(instrumentId), day);
      if (!close) continue;
      const trade = trades.find((t) => t.instrumentId === instrumentId);
      if (!trade) continue;
      const fx = await fxOn(trade.instrument.currency, baseCurrency);
      dayValue = dayValue.plus(qty.times(close).times(fx));
    }
    points.push({ date: day, value: Number(dayValue.toFixed(2)) });
  }

  return { baseCurrency, points };
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
  let qty = ZERO;
  for (const t of trades) {
    if (t.instrumentId !== instrumentId) continue;
    if (t.date.getTime() > asOf.getTime()) break;
    const q = new Decimal(t.quantity.toString());
    qty = t.type === "BUY" ? qty.plus(q) : qty.minus(q);
  }
  return qty;
}

function priceOn(
  series: { date: Date; close: Decimal }[] | undefined,
  asOf: Date,
): Decimal | null {
  if (!series) return null;
  let result: Decimal | null = null;
  for (const point of series) {
    if (point.date.getTime() > asOf.getTime()) break;
    result = point.close;
  }
  return result;
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
