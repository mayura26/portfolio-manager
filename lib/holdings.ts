import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { getFxRate } from "@/lib/fx";
import { visibleTradeWhere } from "@/lib/portfolio-visibility";

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

type Lot = {
  quantity: Decimal;
  unitCostBase: Decimal;
  unitCostInstrument: Decimal;
};

export type Holding = {
  instrumentId: string;
  yahooSymbol: string;
  symbol: string;
  name: string;
  currency: string;
  sector: string | null;
  quantity: Decimal;
  costBase: Decimal;
  avgCostBase: Decimal;
  costInstrument: Decimal;
  avgCostInstrument: Decimal;
  marketPrice: Decimal | null;
  priceAsOf: Date | null;
  marketValueBase: Decimal | null;
  marketValueInstrument: Decimal | null;
  unrealizedPnL: Decimal | null;
  unrealizedPnLInstrument: Decimal | null;
  unrealizedPnLPercent: Decimal | null;
  realizedPnL: Decimal;
  allocationPercent: Decimal | null;
};

export type PortfolioHoldings = {
  portfolioId: string;
  baseCurrency: string;
  holdings: Holding[];
  totalCostBase: Decimal;
  totalMarketValueBase: Decimal;
  totalUnrealizedPnL: Decimal;
  totalRealizedPnL: Decimal;
  hasMissingPrices: boolean;
};

function toDec(value: unknown): Decimal {
  if (value === null || value === undefined) return ZERO;
  if (value instanceof Decimal) return value;
  return new Decimal(value as Decimal.Value);
}

export async function computeHoldings(
  portfolioId: string,
): Promise<PortfolioHoldings> {
  const portfolio = await db.portfolio.findUnique({
    where: { id: portfolioId },
    include: {
      trades: {
        where: visibleTradeWhere,
        orderBy: { date: "asc" },
        include: { instrument: true },
      },
    },
  });

  if (!portfolio) {
    throw new Error(`Portfolio ${portfolioId} not found`);
  }

  const baseCurrency = portfolio.baseCurrency;
  type InstrumentBucket = {
    instrument: (typeof portfolio.trades)[number]["instrument"];
    lots: Lot[];
    realizedPnL: Decimal;
  };
  const byInstrument = new Map<string, InstrumentBucket>();

  for (const trade of portfolio.trades) {
    const instrumentId = trade.instrumentId;
    let bucket = byInstrument.get(instrumentId);
    if (!bucket) {
      bucket = { instrument: trade.instrument, lots: [], realizedPnL: ZERO };
      byInstrument.set(instrumentId, bucket);
    }

    const tradeFx =
      trade.currency === baseCurrency
        ? ONE
        : trade.fxRate
          ? toDec(trade.fxRate)
          : ONE;
    const qty = toDec(trade.quantity);
    const price = toDec(trade.price);
    const fees = toDec(trade.fees);
    const priceBase = price.times(tradeFx);
    const feesBase = fees.times(tradeFx);
    const instrumentCurrency = trade.instrument.currency;
    const tradeToInstrument =
      trade.currency === instrumentCurrency
        ? ONE
        : await getFxRate(trade.currency, instrumentCurrency, trade.date);
    const priceInstrument = price.times(tradeToInstrument);
    const feesInstrument = fees.times(tradeToInstrument);

    if (trade.type === "BUY") {
      const totalCost = priceBase.times(qty).plus(feesBase);
      const totalCostInstrument = priceInstrument
        .times(qty)
        .plus(feesInstrument);
      const unitCostBase = qty.isZero() ? ZERO : totalCost.dividedBy(qty);
      const unitCostInstrument = qty.isZero()
        ? ZERO
        : totalCostInstrument.dividedBy(qty);
      bucket.lots.push({ quantity: qty, unitCostBase, unitCostInstrument });
      continue;
    }

    let remainingToSell = qty;
    let proceeds = priceBase.times(qty).minus(feesBase);
    let costRemoved = ZERO;

    while (remainingToSell.gt(0) && bucket.lots.length > 0) {
      const lot = bucket.lots[0];
      if (lot.quantity.lte(remainingToSell)) {
        costRemoved = costRemoved.plus(lot.quantity.times(lot.unitCostBase));
        remainingToSell = remainingToSell.minus(lot.quantity);
        bucket.lots.shift();
      } else {
        costRemoved = costRemoved.plus(remainingToSell.times(lot.unitCostBase));
        lot.quantity = lot.quantity.minus(remainingToSell);
        remainingToSell = ZERO;
      }
    }

    if (remainingToSell.gt(0)) {
      const sharePerUnit = qty.isZero()
        ? ZERO
        : qty.minus(remainingToSell).dividedBy(qty);
      proceeds = proceeds.times(sharePerUnit);
    }

    bucket.realizedPnL = bucket.realizedPnL.plus(proceeds.minus(costRemoved));
  }

  const openInstrumentIds = Array.from(byInstrument.entries())
    .filter(([, b]) => b.lots.length > 0)
    .map(([id]) => id);

  const latestPrices =
    openInstrumentIds.length === 0
      ? new Map<string, { close: Decimal; date: Date }>()
      : await loadLatestPrices(openInstrumentIds);

  const holdings: Holding[] = [];
  let totalMarketValueBase = ZERO;
  let totalCostBase = ZERO;
  let totalRealizedPnL = ZERO;
  let hasMissingPrices = false;

  for (const [instrumentId, bucket] of byInstrument) {
    const quantity = bucket.lots.reduce(
      (acc, lot) => acc.plus(lot.quantity),
      ZERO,
    );
    const costBase = bucket.lots.reduce(
      (acc, lot) => acc.plus(lot.quantity.times(lot.unitCostBase)),
      ZERO,
    );
    const costInstrument = bucket.lots.reduce(
      (acc, lot) => acc.plus(lot.quantity.times(lot.unitCostInstrument)),
      ZERO,
    );
    const avgCostBase = quantity.isZero() ? ZERO : costBase.dividedBy(quantity);
    const avgCostInstrument = quantity.isZero()
      ? ZERO
      : costInstrument.dividedBy(quantity);
    const realizedPnL = bucket.realizedPnL;
    totalRealizedPnL = totalRealizedPnL.plus(realizedPnL);

    if (quantity.isZero()) {
      // Closed position - skip from open holdings list, but realized P&L already counted.
      continue;
    }

    const priceEntry = latestPrices.get(instrumentId);
    let marketPrice: Decimal | null = null;
    let priceAsOf: Date | null = null;
    let marketValueBase: Decimal | null = null;
    let marketValueInstrument: Decimal | null = null;
    let unrealizedPnL: Decimal | null = null;
    let unrealizedPnLInstrument: Decimal | null = null;
    let unrealizedPnLPercent: Decimal | null = null;

    if (priceEntry) {
      marketPrice = priceEntry.close;
      priceAsOf = priceEntry.date;
      marketValueInstrument = marketPrice.times(quantity);
      const priceCurrency = bucket.instrument.currency;
      const fx =
        priceCurrency === baseCurrency
          ? ONE
          : await getFxRate(priceCurrency, baseCurrency);
      marketValueBase = marketPrice.times(quantity).times(fx);
      unrealizedPnLInstrument = marketValueInstrument.minus(costInstrument);
      unrealizedPnL = marketValueBase.minus(costBase);
      unrealizedPnLPercent = costBase.isZero()
        ? null
        : unrealizedPnL.dividedBy(costBase).times(100);
      totalMarketValueBase = totalMarketValueBase.plus(marketValueBase);
    } else {
      hasMissingPrices = true;
    }

    totalCostBase = totalCostBase.plus(costBase);

    holdings.push({
      instrumentId,
      yahooSymbol: bucket.instrument.yahooSymbol,
      symbol: bucket.instrument.symbol,
      name: bucket.instrument.name,
      currency: bucket.instrument.currency,
      sector: bucket.instrument.sector,
      quantity,
      costBase,
      avgCostBase,
      costInstrument,
      avgCostInstrument,
      marketPrice,
      priceAsOf,
      marketValueBase,
      marketValueInstrument,
      unrealizedPnL,
      unrealizedPnLInstrument,
      unrealizedPnLPercent,
      realizedPnL,
      allocationPercent: null,
    });
  }

  for (const h of holdings) {
    if (h.marketValueBase && totalMarketValueBase.gt(0)) {
      h.allocationPercent = h.marketValueBase
        .dividedBy(totalMarketValueBase)
        .times(100);
    }
  }

  holdings.sort((a, b) => {
    const av = a.marketValueBase ?? ZERO;
    const bv = b.marketValueBase ?? ZERO;
    return bv.comparedTo(av);
  });

  const totalUnrealizedPnL = totalMarketValueBase.minus(totalCostBase);

  return {
    portfolioId,
    baseCurrency,
    holdings,
    totalCostBase,
    totalMarketValueBase,
    totalUnrealizedPnL,
    totalRealizedPnL,
    hasMissingPrices,
  };
}

export type FifoCostTradeInput = {
  instrumentId: string;
  type: "BUY" | "SELL";
  quantity: { toString(): string };
  price: { toString(): string };
  fees: { toString(): string };
  currency: string;
  fxRate: { toString(): string } | null | undefined;
};

/**
 * Total FIFO book cost of open lots after applying trades in chronological order.
 * Matches lot accounting in {@link computeHoldings}.
 */
export function computeFifoOpenCostBasis(
  tradesChronological: FifoCostTradeInput[],
  baseCurrency: string,
): Decimal {
  const byInstrument = new Map<string, Lot[]>();

  for (const trade of tradesChronological) {
    const instrumentId = trade.instrumentId;
    let lots = byInstrument.get(instrumentId);
    if (!lots) {
      lots = [];
      byInstrument.set(instrumentId, lots);
    }

    const tradeFx =
      trade.currency === baseCurrency
        ? ONE
        : trade.fxRate != null && trade.fxRate !== undefined
          ? toDec(trade.fxRate)
          : ONE;
    const qty = toDec(trade.quantity);
    const priceBase = toDec(trade.price).times(tradeFx);
    const feesBase = toDec(trade.fees).times(tradeFx);

    if (trade.type === "BUY") {
      const totalCost = priceBase.times(qty).plus(feesBase);
      const unitCostBase = qty.isZero() ? ZERO : totalCost.dividedBy(qty);
      lots.push({
        quantity: qty,
        unitCostBase,
        unitCostInstrument: unitCostBase,
      });
      continue;
    }

    let remainingToSell = qty;
    while (remainingToSell.gt(0) && lots.length > 0) {
      const lot = lots[0];
      if (lot.quantity.lte(remainingToSell)) {
        remainingToSell = remainingToSell.minus(lot.quantity);
        lots.shift();
      } else {
        lot.quantity = lot.quantity.minus(remainingToSell);
        remainingToSell = ZERO;
      }
    }
  }

  let total = ZERO;
  for (const lots of byInstrument.values()) {
    for (const lot of lots) {
      total = total.plus(lot.quantity.times(lot.unitCostBase));
    }
  }
  return total;
}

async function loadLatestPrices(
  instrumentIds: string[],
): Promise<Map<string, { close: Decimal; date: Date }>> {
  const rows = await db.priceHistory.findMany({
    where: { instrumentId: { in: instrumentIds } },
    orderBy: [{ instrumentId: "asc" }, { date: "desc" }],
  });

  const map = new Map<string, { close: Decimal; date: Date }>();
  for (const row of rows) {
    if (!map.has(row.instrumentId)) {
      map.set(row.instrumentId, { close: toDec(row.close), date: row.date });
    }
  }
  return map;
}
