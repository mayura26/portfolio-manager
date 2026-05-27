import Decimal from "decimal.js";
import { getSettings } from "@/actions/settings";
import { db } from "@/lib/db";
import { getValueHistoryByGroup } from "@/lib/dashboard";
import { getFxRate } from "@/lib/fx";
import { computeHoldings } from "@/lib/holdings";
import {
  excludeEmptyUnassignedWhere,
  visibleTradeWhere,
} from "@/lib/portfolio-visibility";

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

export type PositionStat = {
  instrumentId: string;
  symbol: string;
  name: string;
  value: Decimal;
  percent: Decimal | null;
};

export type DayContributor = {
  instrumentId: string;
  symbol: string;
  name: string;
  contributionBase: Decimal;
  changePercent: Decimal | null;
  sharePercent: Decimal | null;
};

export type DayStat = {
  date: Date;
  valueBase: Decimal;
  changeBase: Decimal;
  changePercent: Decimal;
  contributors: DayContributor[];
};

export type ActivityStats = {
  totalTrades: number;
  uniqueInstruments: number;
  longestHoldingDays: number | null;
  longestHoldingSymbol: string | null;
};

export type PortfolioStats = {
  baseCurrency: string;
  allTimeHigh: { value: Decimal; date: Date } | null;
  bestDay: DayStat | null;
  worstDay: DayStat | null;
  bestUnrealizedAbs: PositionStat | null;
  bestUnrealizedPct: PositionStat | null;
  bestRealizedAbs: PositionStat | null;
  worstPositionAbs: PositionStat | null;
  activity: ActivityStats;
};

type SimpleLot = { qty: Decimal; unitCost: Decimal };
type DayRecordTrade = {
  date: Date;
  instrumentId: string;
  type: "BUY" | "SELL";
  quantity: { toString(): string };
  instrument: {
    id: string;
    symbol: string;
    name: string;
    currency: string;
  };
};
type DayRecordPrice = {
  instrumentId: string;
  date: Date;
  close: { toString(): string };
};
type PricePoint = { date: Date; close: Decimal };
type FxLookup = (from: string, to: string, asOf: Date) => Promise<Decimal>;

function toDec(v: unknown): Decimal {
  if (v === null || v === undefined) return ZERO;
  if (v instanceof Decimal) return v;
  if (typeof v === "object" && "toString" in v) {
    return new Decimal(v.toString());
  }
  return new Decimal(v as Decimal.Value);
}

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcDayStart(d: Date): Date {
  const day = new Date(d);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

function uniqueSortedDates(dates: Date[]): Date[] {
  const set = new Set<string>();
  for (const d of dates) set.add(utcDayKey(d));
  return Array.from(set)
    .sort()
    .map((key) => new Date(`${key}T00:00:00.000Z`));
}

function priceOnOrBefore(
  series: PricePoint[] | undefined,
  asOf: Date,
): PricePoint | null {
  if (!series || series.length === 0) return null;
  const target = utcDayKey(asOf);
  let result: PricePoint | null = null;
  for (const point of series) {
    if (utcDayKey(point.date) > target) break;
    result = point;
  }
  return result;
}

function quantityHeldThroughDay(
  trades: DayRecordTrade[],
  throughDay: Date,
): Decimal {
  const through = utcDayKey(throughDay);
  let qty = ZERO;
  for (const trade of trades) {
    if (utcDayKey(trade.date) > through) break;
    const tradeQty = toDec(trade.quantity);
    qty = trade.type === "BUY" ? qty.plus(tradeQty) : qty.minus(tradeQty);
  }
  return qty;
}

export async function computeMarketDayRecords({
  trades,
  prices,
  baseCurrency,
  fxOn,
}: {
  trades: DayRecordTrade[];
  prices: DayRecordPrice[];
  baseCurrency: string;
  fxOn: FxLookup;
}): Promise<{ bestDay: DayStat | null; worstDay: DayStat | null }> {
  if (trades.length === 0 || prices.length === 0) {
    return { bestDay: null, worstDay: null };
  }

  const tradesByInstrument = new Map<string, DayRecordTrade[]>();
  const instrumentMeta = new Map<string, DayRecordTrade["instrument"]>();
  for (const trade of trades) {
    let bucket = tradesByInstrument.get(trade.instrumentId);
    if (!bucket) {
      bucket = [];
      tradesByInstrument.set(trade.instrumentId, bucket);
    }
    bucket.push(trade);
    instrumentMeta.set(trade.instrumentId, trade.instrument);
  }
  for (const bucket of tradesByInstrument.values()) {
    bucket.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  const pricesByInstrument = new Map<string, PricePoint[]>();
  for (const price of prices) {
    let bucket = pricesByInstrument.get(price.instrumentId);
    if (!bucket) {
      bucket = [];
      pricesByInstrument.set(price.instrumentId, bucket);
    }
    bucket.push({ date: utcDayStart(price.date), close: toDec(price.close) });
  }
  for (const bucket of pricesByInstrument.values()) {
    bucket.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  const dates = uniqueSortedDates(prices.map((p) => p.date));
  let bestDay: DayStat | null = null;
  let worstDay: DayStat | null = null;

  for (let i = 1; i < dates.length; i++) {
    const prevDate = dates[i - 1];
    const date = dates[i];
    let changeBase = ZERO;
    let previousExposureBase = ZERO;
    let valueBase = ZERO;
    const contributors: DayContributor[] = [];

    for (const [instrumentId, instrumentTrades] of tradesByInstrument) {
      const meta = instrumentMeta.get(instrumentId);
      if (!meta) continue;

      const qty = quantityHeldThroughDay(instrumentTrades, prevDate);
      if (qty.lte(0)) continue;

      const priceSeries = pricesByInstrument.get(instrumentId);
      const prevPrice = priceOnOrBefore(priceSeries, prevDate);
      const currPrice = priceOnOrBefore(priceSeries, date);
      if (!prevPrice || !currPrice) continue;
      if (utcDayKey(currPrice.date) === utcDayKey(prevPrice.date)) continue;

      const prevFx = await fxOn(meta.currency, baseCurrency, prevDate);
      const currFx = await fxOn(meta.currency, baseCurrency, date);
      const prevValue = qty.times(prevPrice.close).times(prevFx);
      const currValue = qty.times(currPrice.close).times(currFx);
      if (prevValue.lte(0)) continue;

      const contributionBase = currValue.minus(prevValue);
      changeBase = changeBase.plus(contributionBase);
      previousExposureBase = previousExposureBase.plus(prevValue);
      valueBase = valueBase.plus(currValue);

      if (!contributionBase.isZero()) {
        contributors.push({
          instrumentId,
          symbol: meta.symbol,
          name: meta.name,
          contributionBase,
          changePercent: contributionBase.dividedBy(prevValue).times(100),
          sharePercent: null,
        });
      }
    }

    if (contributors.length === 0 || changeBase.isZero()) continue;

    const grossContributionBase = contributors.reduce(
      (sum, contributor) => sum.plus(contributor.contributionBase.abs()),
      ZERO,
    );
    const dayContributors = contributors
      .map((contributor) => ({
        ...contributor,
        sharePercent: grossContributionBase.gt(0)
          ? contributor.contributionBase
              .abs()
              .dividedBy(grossContributionBase)
              .times(100)
          : null,
      }))
      .sort((a, b) =>
        b.contributionBase.abs().comparedTo(a.contributionBase.abs()),
      );

    const dayStat: DayStat = {
      date,
      valueBase,
      changeBase,
      changePercent: previousExposureBase.gt(0)
        ? changeBase.dividedBy(previousExposureBase).times(100)
        : ZERO,
      contributors: dayContributors,
    };

    if (!bestDay || changeBase.gt(bestDay.changeBase)) bestDay = dayStat;
    if (!worstDay || changeBase.lt(worstDay.changeBase)) worstDay = dayStat;
  }

  return { bestDay, worstDay };
}

/** Inline FIFO realized P&L — mirrors the logic in computeHoldings. */
function computeRealizedPnL(
  trades: Array<{
    type: string;
    quantity: { toString(): string };
    price: { toString(): string };
    fees: { toString(): string } | null;
    currency: string;
    fxRate: { toString(): string } | null;
  }>,
  baseCurrency: string,
): Decimal {
  const lots: SimpleLot[] = [];
  let realized = ZERO;

  for (const t of trades) {
    const tradeFx =
      t.currency === baseCurrency
        ? ONE
        : t.fxRate
          ? toDec(t.fxRate)
          : ONE;
    const qty = toDec(t.quantity);
    const priceBase = toDec(t.price).times(tradeFx);
    const feesBase = toDec(t.fees).times(tradeFx);

    if (t.type === "BUY") {
      const totalCost = priceBase.times(qty).plus(feesBase);
      lots.push({ qty, unitCost: qty.isZero() ? ZERO : totalCost.dividedBy(qty) });
      continue;
    }

    // SELL
    let remaining = qty;
    let proceeds = priceBase.times(qty).minus(feesBase);
    let costRemoved = ZERO;

    while (remaining.gt(0) && lots.length > 0) {
      const lot = lots[0];
      if (lot.qty.lte(remaining)) {
        costRemoved = costRemoved.plus(lot.qty.times(lot.unitCost));
        remaining = remaining.minus(lot.qty);
        lots.shift();
      } else {
        costRemoved = costRemoved.plus(remaining.times(lot.unitCost));
        lot.qty = lot.qty.minus(remaining);
        remaining = ZERO;
      }
    }

    if (remaining.gt(0)) {
      const share = qty.isZero() ? ZERO : qty.minus(remaining).dividedBy(qty);
      proceeds = proceeds.times(share);
    }

    realized = realized.plus(proceeds.minus(costRemoved));
  }

  return realized;
}

export async function getPortfolioStats(): Promise<PortfolioStats> {
  const settings = await getSettings();
  const baseCurrency = settings.defaultBaseCurrency;

  // ── 1. All-time high + best/worst day from full value history ──────────
  // Build a shared FX cache used across all sections
  const fxCache = new Map<string, Decimal>();
  async function cachedFx(
    from: string,
    to: string,
    asOf?: Date,
  ): Promise<Decimal> {
    if (from === to) return ONE;
    const dateKey = asOf ? utcDayKey(asOf) : "spot";
    const key = `${from}-${to}-${dateKey}`;
    const cached = fxCache.get(key);
    if (cached) return cached;
    const rate = await getFxRate(from, to, asOf);
    fxCache.set(key, rate);
    return rate;
  }

  // Daily records use market P&L only: prior-close quantity times the price/FX
  // move to the current close. This excludes deposits, trades, and import jumps.
  const allTrades = await db.trade.findMany({
    where: visibleTradeWhere,
    orderBy: [{ portfolioId: "asc" }, { instrumentId: "asc" }, { date: "asc" }],
    include: {
      instrument: { select: { id: true, symbol: true, name: true, currency: true } },
      portfolio: { select: { baseCurrency: true } },
    },
  });

  const history = await getValueHistoryByGroup(36500);

  let allTimeHigh: { value: Decimal; date: Date } | null = null;
  let bestDay: DayStat | null = null;
  let worstDay: DayStat | null = null;

  const totals = history.points.map((pt) => {
    let total = ZERO;
    for (const [key, val] of Object.entries(pt)) {
      if (key === "date") continue;
      total = total.plus(new Decimal(val as number));
    }
    return { date: pt.date, total };
  });

  for (let i = 0; i < totals.length; i++) {
    const { date, total } = totals[i];

    if (!allTimeHigh || total.gt(allTimeHigh.value)) {
      allTimeHigh = { value: total, date };
    }
  }

  const instrumentIds = Array.from(
    new Set(allTrades.map((trade) => trade.instrumentId)),
  );
  const earliestTradeDate =
    allTrades.length > 0
      ? allTrades
          .map((trade) => utcDayStart(trade.date))
          .reduce((earliest, date) =>
            date.getTime() < earliest.getTime() ? date : earliest,
          )
      : null;
  const dailyPriceRows =
    instrumentIds.length > 0 && earliestTradeDate
      ? await db.priceHistory.findMany({
          where: {
            instrumentId: { in: instrumentIds },
            date: { gte: earliestTradeDate },
          },
          orderBy: [{ instrumentId: "asc" }, { date: "asc" }],
        })
      : [];
  const marketRecords = await computeMarketDayRecords({
    trades: allTrades,
    prices: dailyPriceRows,
    baseCurrency,
    fxOn: cachedFx,
  });
  bestDay = marketRecords.bestDay;
  worstDay = marketRecords.worstDay;

  // ── 2. Per-position unrealized P&L (open positions) ───────────────────
  const portfolios = await db.portfolio.findMany({
    where: excludeEmptyUnassignedWhere,
    select: { id: true, baseCurrency: true },
  });

  type InstrumentEntry = {
    instrumentId: string;
    symbol: string;
    name: string;
    unrealizedPnL: Decimal;
    costBase: Decimal;
  };
  const unrealizedMap = new Map<string, InstrumentEntry>();
  const openInstrumentIds = new Set<string>();

  for (const portfolio of portfolios) {
    const data = await computeHoldings(portfolio.id);
    const toGlobal =
      portfolio.baseCurrency === baseCurrency
        ? ONE
        : await getFxRate(portfolio.baseCurrency, baseCurrency);

    for (const h of data.holdings) {
      if (h.unrealizedPnL === null) continue;
      openInstrumentIds.add(h.instrumentId);

      const unrealizedGlobal = h.unrealizedPnL.times(toGlobal);
      const costGlobal = h.costBase.times(toGlobal);

      const existing = unrealizedMap.get(h.instrumentId);
      if (existing) {
        existing.unrealizedPnL = existing.unrealizedPnL.plus(unrealizedGlobal);
        existing.costBase = existing.costBase.plus(costGlobal);
      } else {
        unrealizedMap.set(h.instrumentId, {
          instrumentId: h.instrumentId,
          symbol: h.symbol,
          name: h.name,
          unrealizedPnL: unrealizedGlobal,
          costBase: costGlobal,
        });
      }
    }
  }

  let bestUnrealizedAbs: PositionStat | null = null;
  let bestUnrealizedPct: PositionStat | null = null;
  let worstPositionAbs: PositionStat | null = null;

  for (const entry of unrealizedMap.values()) {
    const pct = entry.costBase.gt(0)
      ? entry.unrealizedPnL.dividedBy(entry.costBase).times(100)
      : null;

    if (!bestUnrealizedAbs || entry.unrealizedPnL.gt(bestUnrealizedAbs.value)) {
      bestUnrealizedAbs = {
        instrumentId: entry.instrumentId,
        symbol: entry.symbol,
        name: entry.name,
        value: entry.unrealizedPnL,
        percent: pct,
      };
    }
    if (pct && (!bestUnrealizedPct || pct.gt(bestUnrealizedPct.percent ?? ZERO))) {
      bestUnrealizedPct = {
        instrumentId: entry.instrumentId,
        symbol: entry.symbol,
        name: entry.name,
        value: entry.unrealizedPnL,
        percent: pct,
      };
    }
    if (!worstPositionAbs || entry.unrealizedPnL.lt(worstPositionAbs.value)) {
      worstPositionAbs = {
        instrumentId: entry.instrumentId,
        symbol: entry.symbol,
        name: entry.name,
        value: entry.unrealizedPnL,
        percent: pct,
      };
    }
  }

  // Only show worst if it's actually negative
  if (worstPositionAbs && worstPositionAbs.value.gte(0)) {
    worstPositionAbs = null;
  }

  // ── 3. Per-instrument realized P&L (all instruments, open + closed) ────
  type RealizedEntry = { instrumentId: string; symbol: string; name: string; realizedPnL: Decimal };
  const realizedMap = new Map<string, RealizedEntry>();

  // Group by (portfolioId, instrumentId) to run FIFO per portfolio
  type TradeRecord = (typeof allTrades)[number];
  const byPortfolioAndInstrument = new Map<string, TradeRecord[]>();
  for (const t of allTrades) {
    const key = `${t.portfolioId}|${t.instrumentId}`;
    let arr = byPortfolioAndInstrument.get(key);
    if (!arr) {
      arr = [];
      byPortfolioAndInstrument.set(key, arr);
    }
    arr.push(t);
  }

  for (const [, trades] of byPortfolioAndInstrument) {
    if (trades.length === 0) continue;
    const first = trades[0];
    const portfolioBase = first.portfolio.baseCurrency;
    const toGlobal = await cachedFx(portfolioBase, baseCurrency);

    const realizedInPortfolioBase = computeRealizedPnL(trades, portfolioBase);
    const realizedGlobal = realizedInPortfolioBase.times(toGlobal);

    const instrId = first.instrumentId;
    const existing = realizedMap.get(instrId);
    if (existing) {
      existing.realizedPnL = existing.realizedPnL.plus(realizedGlobal);
    } else {
      realizedMap.set(instrId, {
        instrumentId: instrId,
        symbol: first.instrument.symbol,
        name: first.instrument.name,
        realizedPnL: realizedGlobal,
      });
    }
  }

  let bestRealizedAbs: PositionStat | null = null;
  for (const entry of realizedMap.values()) {
    if (entry.realizedPnL.lte(0)) continue;
    if (!bestRealizedAbs || entry.realizedPnL.gt(bestRealizedAbs.value)) {
      bestRealizedAbs = {
        instrumentId: entry.instrumentId,
        symbol: entry.symbol,
        name: entry.name,
        value: entry.realizedPnL,
        percent: null,
      };
    }
  }

  // ── 4. Activity stats ──────────────────────────────────────────────────
  const [totalTrades, uniqueInstrumentRows] = await Promise.all([
    db.trade.count({ where: visibleTradeWhere }),
    db.trade.findMany({
      where: visibleTradeWhere,
      select: { instrumentId: true },
      distinct: ["instrumentId"],
    }),
  ]);

  let longestHoldingDays: number | null = null;
  let longestHoldingSymbol: string | null = null;

  if (openInstrumentIds.size > 0) {
    const oldestBuys = await db.trade.groupBy({
      by: ["instrumentId"],
      where: {
        ...visibleTradeWhere,
        type: "BUY",
        instrumentId: { in: Array.from(openInstrumentIds) },
      },
      _min: { date: true },
      orderBy: { _min: { date: "asc" } },
      take: 1,
    });

    if (oldestBuys.length > 0 && oldestBuys[0]._min.date) {
      const oldestDate = oldestBuys[0]._min.date;
      longestHoldingDays = Math.floor(
        (Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const instrument = await db.instrument.findUnique({
        where: { id: oldestBuys[0].instrumentId },
        select: { symbol: true },
      });
      longestHoldingSymbol = instrument?.symbol ?? null;
    }
  }

  return {
    baseCurrency,
    allTimeHigh,
    bestDay,
    worstDay,
    bestUnrealizedAbs,
    bestUnrealizedPct,
    bestRealizedAbs,
    worstPositionAbs,
    activity: {
      totalTrades,
      uniqueInstruments: uniqueInstrumentRows.length,
      longestHoldingDays,
      longestHoldingSymbol,
    },
  };
}
