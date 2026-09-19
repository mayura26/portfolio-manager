import Decimal from "decimal.js";
import { getGroupValueHistory, getValueHistoryByGroup } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { getFxRate } from "@/lib/fx";
import { computeHoldings } from "@/lib/holdings";
import {
  excludeEmptyUnassignedWhere,
  visibleTradeWhere,
} from "@/lib/portfolio-visibility";
import { getSettings } from "@/lib/settings";
import {
  adjustQuantityForSplits,
  indexStockSplits,
  loadStockSplits,
  type StockSplitLike,
  splitRatio,
  utcDayStartMs,
} from "@/lib/stock-splits";

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

export type RecordStats = {
  allTimeHigh: { value: Decimal; date: Date } | null;
  bestDay: DayStat | null;
  worstDay: DayStat | null;
  bestUnrealizedAbs: PositionStat | null;
  bestUnrealizedPct: PositionStat | null;
  bestRealizedAbs: PositionStat | null;
  worstPositionAbs: PositionStat | null;
  activity: ActivityStats;
};

export type GroupRecordStats = RecordStats & {
  groupId: string;
  name: string;
};

export type PortfolioStats = RecordStats & {
  baseCurrency: string;
  groups: GroupRecordStats[];
};

export type StatsView = RecordStats & { baseCurrency: string };

type SimpleLot = { qty: Decimal; unitCost: Decimal };
type RealizedSplitState = {
  splits: StockSplitLike[];
  nextIndex: number;
};
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

function applySplitToSimpleLots(lots: SimpleLot[], split: StockSplitLike) {
  const ratio = splitRatio(split);
  if (ratio.isZero()) return;
  for (const lot of lots) {
    lot.qty = lot.qty.times(ratio);
    lot.unitCost = lot.unitCost.dividedBy(ratio);
  }
}

function applyRealizedSplitsThrough(
  lots: SimpleLot[],
  state: RealizedSplitState,
  throughDate: Date,
) {
  const throughDay = utcDayStartMs(throughDate);
  while (state.nextIndex < state.splits.length) {
    const split = state.splits[state.nextIndex];
    if (utcDayStartMs(split.exDate) > throughDay) break;
    applySplitToSimpleLots(lots, split);
    state.nextIndex += 1;
  }
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
  splits: StockSplitLike[] = [],
): Decimal {
  const through = utcDayKey(throughDay);
  let qty = ZERO;
  for (const trade of trades) {
    if (utcDayKey(trade.date) > through) break;
    const tradeQty = adjustQuantityForSplits(
      toDec(trade.quantity),
      splits,
      trade.instrumentId,
      trade.date,
    );
    qty = trade.type === "BUY" ? qty.plus(tradeQty) : qty.minus(tradeQty);
  }
  return qty;
}

export async function computeMarketDayRecords({
  trades,
  prices,
  baseCurrency,
  fxOn,
  splits = [],
}: {
  trades: DayRecordTrade[];
  prices: DayRecordPrice[];
  baseCurrency: string;
  fxOn: FxLookup;
  splits?: StockSplitLike[];
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

      const qty = quantityHeldThroughDay(instrumentTrades, prevDate, splits);
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
    instrumentId: string;
    date: Date;
    type: string;
    quantity: { toString(): string };
    price: { toString(): string };
    fees: { toString(): string } | null;
    currency: string;
    fxRate: { toString(): string } | null;
  }>,
  baseCurrency: string,
  splits: StockSplitLike[] = [],
): Decimal {
  const lots: SimpleLot[] = [];
  let realized = ZERO;
  const splitsByInstrument = indexStockSplits(splits);
  const splitStates = new Map<string, RealizedSplitState>();

  for (const t of trades) {
    let splitState = splitStates.get(t.instrumentId);
    if (!splitState) {
      splitState = {
        splits: splitsByInstrument.get(t.instrumentId) ?? [],
        nextIndex: 0,
      };
      splitStates.set(t.instrumentId, splitState);
    }
    applyRealizedSplitsThrough(lots, splitState, t.date);

    const tradeFx =
      t.currency === baseCurrency ? ONE : t.fxRate ? toDec(t.fxRate) : ONE;
    const qty = toDec(t.quantity);
    const priceBase = toDec(t.price).times(tradeFx);
    const feesBase = toDec(t.fees).times(tradeFx);

    if (t.type === "BUY") {
      const totalCost = priceBase.times(qty).plus(feesBase);
      lots.push({
        qty,
        unitCost: qty.isZero() ? ZERO : totalCost.dividedBy(qty),
      });
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

type InstrumentEntry = {
  instrumentId: string;
  symbol: string;
  name: string;
  unrealizedPnL: Decimal;
  costBase: Decimal;
};

type RealizedEntry = {
  instrumentId: string;
  symbol: string;
  name: string;
  realizedPnL: Decimal;
};

function historyPointTotal(
  pt: { date: Date } & Record<string, number>,
): Decimal {
  let total = ZERO;
  for (const [key, val] of Object.entries(pt)) {
    if (key === "date") continue;
    if (typeof val !== "number") continue;
    total = total.plus(val);
  }
  return total;
}

function allTimeHighFromTotals(
  totals: Array<{ date: Date; total: Decimal }>,
): { value: Decimal; date: Date } | null {
  let allTimeHigh: { value: Decimal; date: Date } | null = null;
  for (const { date, total } of totals) {
    if (!allTimeHigh || total.gt(allTimeHigh.value)) {
      allTimeHigh = { value: total, date };
    }
  }
  return allTimeHigh;
}

function pickUnrealizedRecords(map: Map<string, InstrumentEntry>): {
  bestUnrealizedAbs: PositionStat | null;
  bestUnrealizedPct: PositionStat | null;
  worstPositionAbs: PositionStat | null;
} {
  let bestUnrealizedAbs: PositionStat | null = null;
  let bestUnrealizedPct: PositionStat | null = null;
  let worstPositionAbs: PositionStat | null = null;

  for (const entry of map.values()) {
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
    if (
      pct &&
      (!bestUnrealizedPct || pct.gt(bestUnrealizedPct.percent ?? ZERO))
    ) {
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

  if (worstPositionAbs?.value.gte(0)) {
    worstPositionAbs = null;
  }

  return { bestUnrealizedAbs, bestUnrealizedPct, worstPositionAbs };
}

function pickBestRealized(
  map: Map<string, RealizedEntry>,
): PositionStat | null {
  let bestRealizedAbs: PositionStat | null = null;
  for (const entry of map.values()) {
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
  return bestRealizedAbs;
}

function addUnrealized(
  map: Map<string, InstrumentEntry>,
  holding: {
    instrumentId: string;
    symbol: string;
    name: string;
    unrealizedPnL: Decimal;
    costBase: Decimal;
  },
) {
  const existing = map.get(holding.instrumentId);
  if (existing) {
    existing.unrealizedPnL = existing.unrealizedPnL.plus(holding.unrealizedPnL);
    existing.costBase = existing.costBase.plus(holding.costBase);
    return;
  }
  map.set(holding.instrumentId, {
    instrumentId: holding.instrumentId,
    symbol: holding.symbol,
    name: holding.name,
    unrealizedPnL: holding.unrealizedPnL,
    costBase: holding.costBase,
  });
}

function addRealized(map: Map<string, RealizedEntry>, entry: RealizedEntry) {
  const existing = map.get(entry.instrumentId);
  if (existing) {
    existing.realizedPnL = existing.realizedPnL.plus(entry.realizedPnL);
    return;
  }
  map.set(entry.instrumentId, { ...entry });
}

function computeActivity(
  trades: Array<{
    instrumentId: string;
    type: string;
    date: Date;
    instrument: { symbol: string };
  }>,
  openInstrumentIds: Set<string>,
): ActivityStats {
  const uniqueInstruments = new Set(trades.map((t) => t.instrumentId)).size;
  let longestHoldingDays: number | null = null;
  let longestHoldingSymbol: string | null = null;

  if (openInstrumentIds.size > 0) {
    const oldestByInstrument = new Map<
      string,
      { date: Date; symbol: string }
    >();
    for (const trade of trades) {
      if (trade.type !== "BUY" || !openInstrumentIds.has(trade.instrumentId)) {
        continue;
      }
      const existing = oldestByInstrument.get(trade.instrumentId);
      if (!existing || trade.date.getTime() < existing.date.getTime()) {
        oldestByInstrument.set(trade.instrumentId, {
          date: trade.date,
          symbol: trade.instrument.symbol,
        });
      }
    }

    const now = Date.now();
    for (const { date, symbol } of oldestByInstrument.values()) {
      const days = Math.floor((now - date.getTime()) / (1000 * 60 * 60 * 24));
      if (longestHoldingDays === null || days > longestHoldingDays) {
        longestHoldingDays = days;
        longestHoldingSymbol = symbol;
      }
    }
  }

  return {
    totalTrades: trades.length,
    uniqueInstruments,
    longestHoldingDays,
    longestHoldingSymbol,
  };
}

export async function getPortfolioStats(): Promise<PortfolioStats> {
  const settings = await getSettings();
  const baseCurrency = settings.defaultBaseCurrency;

  const fxCache = new Map<string, Decimal>();
  async function cachedFx(
    from: string,
    to: string,
    asOf?: Date,
  ): Promise<Decimal> {
    if (from.toUpperCase() === to.toUpperCase()) return ONE;
    const dateKey = asOf ? utcDayKey(asOf) : "spot";
    const key = `${from}-${to}-${dateKey}`;
    const cached = fxCache.get(key);
    if (cached) return cached;
    const rate = await getFxRate(from, to, asOf);
    fxCache.set(key, rate);
    return rate;
  }

  const [groups, allTrades, history, portfolios] = await Promise.all([
    db.portfolioGroup.findMany({
      select: { id: true, name: true, baseCurrency: true },
      orderBy: { name: "asc" },
    }),
    db.trade.findMany({
      where: visibleTradeWhere,
      orderBy: [
        { portfolioId: "asc" },
        { instrumentId: "asc" },
        { date: "asc" },
      ],
      include: {
        instrument: {
          select: { id: true, symbol: true, name: true, currency: true },
        },
        portfolio: { select: { baseCurrency: true, groupId: true } },
      },
    }),
    getValueHistoryByGroup(36500),
    db.portfolio.findMany({
      where: excludeEmptyUnassignedWhere,
      select: { id: true, baseCurrency: true, groupId: true },
    }),
  ]);

  const allTimeHigh = allTimeHighFromTotals(
    history.points.map((pt) => ({
      date: pt.date,
      total: historyPointTotal(pt),
    })),
  );

  const instrumentIds = Array.from(
    new Set(allTrades.map((trade) => trade.instrumentId)),
  );
  const splits = await loadStockSplits(instrumentIds);
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

  // Daily records use market P&L only: prior-close quantity times the price/FX
  // move to the current close. This excludes deposits, trades, and import jumps.
  const [marketRecords, groupHistories, groupMarketRecords] = await Promise.all(
    [
      computeMarketDayRecords({
        trades: allTrades,
        prices: dailyPriceRows,
        baseCurrency,
        fxOn: cachedFx,
        splits,
      }),
      Promise.all(
        groups.map(async (group) => ({
          group,
          history: await getGroupValueHistory(group.id, 36500),
        })),
      ),
      Promise.all(
        groups.map((group) =>
          computeMarketDayRecords({
            trades: allTrades.filter(
              (trade) => trade.portfolio.groupId === group.id,
            ),
            prices: dailyPriceRows,
            baseCurrency,
            fxOn: cachedFx,
            splits,
          }),
        ),
      ),
    ],
  );

  const groupAllTimeHighs = await Promise.all(
    groupHistories.map(async ({ group, history: groupHistory }) => {
      const totals = [];
      for (const pt of groupHistory.points) {
        let total = historyPointTotal(pt);
        if (group.baseCurrency.toUpperCase() !== baseCurrency.toUpperCase()) {
          total = total.times(
            await cachedFx(group.baseCurrency, baseCurrency, pt.date),
          );
        }
        totals.push({ date: pt.date, total });
      }
      return allTimeHighFromTotals(totals);
    }),
  );

  const unrealizedMap = new Map<string, InstrumentEntry>();
  const openInstrumentIds = new Set<string>();
  const groupUnrealized = new Map<string, Map<string, InstrumentEntry>>();
  const groupOpenInstrumentIds = new Map<string, Set<string>>();
  for (const group of groups) {
    groupUnrealized.set(group.id, new Map());
    groupOpenInstrumentIds.set(group.id, new Set());
  }

  for (const portfolio of portfolios) {
    const data = await computeHoldings(portfolio.id);
    const toGlobal =
      portfolio.baseCurrency === baseCurrency
        ? ONE
        : await getFxRate(portfolio.baseCurrency, baseCurrency);
    const groupMap = groupUnrealized.get(portfolio.groupId);
    const groupOpen = groupOpenInstrumentIds.get(portfolio.groupId);

    for (const h of data.holdings) {
      if (h.unrealizedPnL === null) continue;
      openInstrumentIds.add(h.instrumentId);
      groupOpen?.add(h.instrumentId);

      const holding = {
        instrumentId: h.instrumentId,
        symbol: h.symbol,
        name: h.name,
        unrealizedPnL: h.unrealizedPnL.times(toGlobal),
        costBase: h.costBase.times(toGlobal),
      };
      addUnrealized(unrealizedMap, holding);
      if (groupMap) addUnrealized(groupMap, holding);
    }
  }

  const accountUnrealized = pickUnrealizedRecords(unrealizedMap);

  const realizedMap = new Map<string, RealizedEntry>();
  const groupRealized = new Map<string, Map<string, RealizedEntry>>();
  for (const group of groups) {
    groupRealized.set(group.id, new Map());
  }

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

    const realizedInPortfolioBase = computeRealizedPnL(
      trades,
      portfolioBase,
      splits,
    );
    const realizedGlobal = realizedInPortfolioBase.times(toGlobal);
    const entry: RealizedEntry = {
      instrumentId: first.instrumentId,
      symbol: first.instrument.symbol,
      name: first.instrument.name,
      realizedPnL: realizedGlobal,
    };
    addRealized(realizedMap, entry);
    const groupMap = groupRealized.get(first.portfolio.groupId);
    if (groupMap) addRealized(groupMap, entry);
  }

  const groupStats: GroupRecordStats[] = groups.map((group, index) => {
    const groupTrades = allTrades.filter(
      (trade) => trade.portfolio.groupId === group.id,
    );
    const unrealized = pickUnrealizedRecords(
      groupUnrealized.get(group.id) ?? new Map(),
    );
    const days = groupMarketRecords[index];
    return {
      groupId: group.id,
      name: group.name,
      allTimeHigh: groupAllTimeHighs[index] ?? null,
      bestDay: days.bestDay,
      worstDay: days.worstDay,
      ...unrealized,
      bestRealizedAbs: pickBestRealized(
        groupRealized.get(group.id) ?? new Map(),
      ),
      activity: computeActivity(
        groupTrades,
        groupOpenInstrumentIds.get(group.id) ?? new Set(),
      ),
    };
  });

  return {
    baseCurrency,
    allTimeHigh,
    bestDay: marketRecords.bestDay,
    worstDay: marketRecords.worstDay,
    ...accountUnrealized,
    bestRealizedAbs: pickBestRealized(realizedMap),
    activity: computeActivity(allTrades, openInstrumentIds),
    groups: groupStats,
  };
}
