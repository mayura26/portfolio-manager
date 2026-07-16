import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { convert } from "@/lib/fx";
import { computeHoldings } from "@/lib/holdings";
import {
  getGroupPortfolioReturnPeriods,
  type ReturnPeriods,
} from "@/lib/performance";
import { visibleTradeWhere } from "@/lib/portfolio-visibility";
import {
  adjustQuantityForSplits,
  loadStockSplits,
  type StockSplitLike,
} from "@/lib/stock-splits";

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

export type DecimalReturnPeriods = Record<keyof ReturnPeriods, Decimal | null>;

export type PortfolioHoldingPerformanceRow = {
  instrumentId: string;
  yahooSymbol: string;
  symbol: string;
  name: string;
  currency: string;
  pnlPercent: Decimal | null;
  pnlTotalBase: Decimal | null;
  positionSizeBase: Decimal | null;
  returns: DecimalReturnPeriods;
};

export type PortfolioHoldingPerformance = {
  baseCurrency: string;
  rows: PortfolioHoldingPerformanceRow[];
};

export type GroupPortfolioPerformanceRow = {
  portfolioId: string;
  name: string;
  baseCurrency: string;
  pnlPercent: Decimal | null;
  pnlTotalBase: Decimal;
  positionSizeBase: Decimal;
  returns: DecimalReturnPeriods;
};

export type GroupPortfolioPerformance = {
  baseCurrency: string;
  rows: GroupPortfolioPerformanceRow[];
};

type PositionTrade = {
  instrumentId: string;
  date: Date;
  type: "BUY" | "SELL";
  quantity: { toString(): string };
};

type PricePoint = {
  date: Date;
  close: Decimal;
};

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function quantityHeldOn(
  trades: PositionTrade[],
  instrumentId: string,
  asOf: Date,
  splits: StockSplitLike[],
): Decimal {
  const through = utcDayStart(asOf);
  let qty = ZERO;
  for (const trade of trades) {
    if (trade.instrumentId !== instrumentId) continue;
    if (utcDayStart(trade.date) > through) break;
    const tradeQty = adjustQuantityForSplits(
      new Decimal(trade.quantity.toString()),
      splits,
      instrumentId,
      trade.date,
    );
    qty = trade.type === "BUY" ? qty.plus(tradeQty) : qty.minus(tradeQty);
  }
  return qty;
}

function priceOnOrBefore(
  prices: PricePoint[] | undefined,
  asOf: Date,
): Decimal | null {
  if (!prices || prices.length === 0) return null;
  const asOfDay = utcDayStart(asOf);
  let result: Decimal | null = null;
  for (const price of prices) {
    if (utcDayStart(price.date) > asOfDay) break;
    result = price.close;
  }
  return result;
}

function priceReturnPercent(
  latestPrice: Decimal | null,
  latestDate: Date | null,
  prices: PricePoint[] | undefined,
  trades: PositionTrade[],
  instrumentId: string,
  splits: StockSplitLike[],
  days: number,
): Decimal | null {
  if (!latestPrice || !latestDate) return null;

  const anchorDate = addUtcDays(latestDate, -days);
  if (quantityHeldOn(trades, instrumentId, anchorDate, splits).lte(0))
    return null;

  const anchorPrice = priceOnOrBefore(prices, anchorDate);
  if (!anchorPrice || anchorPrice.isZero()) return null;

  return latestPrice.dividedBy(anchorPrice).minus(ONE).times(100);
}

function toDecimalReturns(returns: ReturnPeriods | undefined) {
  return {
    day: returns?.day == null ? null : new Decimal(returns.day),
    week: returns?.week == null ? null : new Decimal(returns.week),
    month: returns?.month == null ? null : new Decimal(returns.month),
  };
}

export async function getPortfolioHoldingPerformance(
  portfolioId: string,
): Promise<PortfolioHoldingPerformance> {
  const holdings = await computeHoldings(portfolioId);
  const instrumentIds = holdings.holdings.map((h) => h.instrumentId);
  if (instrumentIds.length === 0) {
    return { baseCurrency: holdings.baseCurrency, rows: [] };
  }

  const latestDate = holdings.holdings.reduce<Date | null>(
    (latest, holding) => {
      if (!holding.priceAsOf) return latest;
      if (!latest || holding.priceAsOf > latest) return holding.priceAsOf;
      return latest;
    },
    null,
  );
  const priceSince = latestDate ? addUtcDays(latestDate, -40) : undefined;

  const [trades, prices] = await Promise.all([
    db.trade.findMany({
      where: { portfolioId, ...visibleTradeWhere },
      orderBy: { date: "asc" },
      select: {
        instrumentId: true,
        date: true,
        type: true,
        quantity: true,
      },
    }),
    db.priceHistory.findMany({
      where: {
        instrumentId: { in: instrumentIds },
        ...(priceSince ? { date: { gte: priceSince } } : {}),
      },
      orderBy: [{ instrumentId: "asc" }, { date: "asc" }],
    }),
  ]);

  const splits = await loadStockSplits(instrumentIds);

  const pricesByInstrument = new Map<string, PricePoint[]>();
  for (const price of prices) {
    let arr = pricesByInstrument.get(price.instrumentId);
    if (!arr) {
      arr = [];
      pricesByInstrument.set(price.instrumentId, arr);
    }
    arr.push({ date: price.date, close: new Decimal(price.close.toString()) });
  }

  return {
    baseCurrency: holdings.baseCurrency,
    rows: holdings.holdings.map((holding) => ({
      instrumentId: holding.instrumentId,
      yahooSymbol: holding.yahooSymbol,
      symbol: holding.symbol,
      name: holding.name,
      currency: holding.currency,
      pnlPercent: holding.unrealizedPnLPercent,
      pnlTotalBase: holding.unrealizedPnL,
      positionSizeBase: holding.marketValueBase,
      returns: {
        day: priceReturnPercent(
          holding.marketPrice,
          holding.priceAsOf,
          pricesByInstrument.get(holding.instrumentId),
          trades,
          holding.instrumentId,
          splits,
          1,
        ),
        week: priceReturnPercent(
          holding.marketPrice,
          holding.priceAsOf,
          pricesByInstrument.get(holding.instrumentId),
          trades,
          holding.instrumentId,
          splits,
          7,
        ),
        month: priceReturnPercent(
          holding.marketPrice,
          holding.priceAsOf,
          pricesByInstrument.get(holding.instrumentId),
          trades,
          holding.instrumentId,
          splits,
          30,
        ),
      },
    })),
  };
}

export async function getGroupPortfolioPerformance(
  groupId: string,
): Promise<GroupPortfolioPerformance> {
  const group = await db.portfolioGroup.findUnique({
    where: { id: groupId },
    include: {
      portfolios: {
        orderBy: { name: "asc" },
        include: {
          _count: { select: { trades: { where: visibleTradeWhere } } },
        },
      },
    },
  });
  if (!group) {
    return { baseCurrency: "USD", rows: [] };
  }

  const periodReturns = await getGroupPortfolioReturnPeriods(groupId);
  const rows: GroupPortfolioPerformanceRow[] = [];

  for (const portfolio of group.portfolios) {
    const holdings = await computeHoldings(portfolio.id);
    if (
      holdings.totalMarketValueBase.isZero() &&
      portfolio._count.trades === 0
    ) {
      continue;
    }

    const positionSizeBase =
      portfolio.baseCurrency.toUpperCase() === group.baseCurrency.toUpperCase()
        ? holdings.totalMarketValueBase
        : await convert(
            holdings.totalMarketValueBase,
            portfolio.baseCurrency,
            group.baseCurrency,
          );
    const pnlTotalBase =
      portfolio.baseCurrency.toUpperCase() === group.baseCurrency.toUpperCase()
        ? holdings.totalUnrealizedPnL
        : await convert(
            holdings.totalUnrealizedPnL,
            portfolio.baseCurrency,
            group.baseCurrency,
          );
    const pnlPercent = holdings.totalCostBase.isZero()
      ? null
      : holdings.totalUnrealizedPnL
          .dividedBy(holdings.totalCostBase)
          .times(100);

    rows.push({
      portfolioId: portfolio.id,
      name: portfolio.name,
      baseCurrency: portfolio.baseCurrency,
      pnlPercent,
      pnlTotalBase,
      positionSizeBase,
      returns: toDecimalReturns(periodReturns.get(portfolio.id)),
    });
  }

  rows.sort((a, b) => b.positionSizeBase.comparedTo(a.positionSizeBase));

  return {
    baseCurrency: group.baseCurrency,
    rows,
  };
}
