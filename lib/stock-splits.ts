import Decimal from "decimal.js";
import { db } from "@/lib/db";

const ONE = new Decimal(1);

export type StockSplitLike = {
  instrumentId: string;
  exDate: Date;
  numerator: { toString(): string } | string | number;
  denominator: { toString(): string } | string | number;
};

export function utcDayStartMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function toDecimal(value: StockSplitLike["numerator"]): Decimal {
  return value instanceof Decimal ? value : new Decimal(value.toString());
}

export function splitRatio(split: StockSplitLike): Decimal {
  const denominator = toDecimal(split.denominator);
  if (denominator.isZero()) return ONE;
  return toDecimal(split.numerator).dividedBy(denominator);
}

export function sortStockSplits<T extends StockSplitLike>(splits: T[]): T[] {
  return [...splits].sort((a, b) => {
    const instrumentCompare = a.instrumentId.localeCompare(b.instrumentId);
    if (instrumentCompare !== 0) return instrumentCompare;
    return utcDayStartMs(a.exDate) - utcDayStartMs(b.exDate);
  });
}

export function indexStockSplits<T extends StockSplitLike>(
  splits: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const split of sortStockSplits(splits)) {
    const bucket = map.get(split.instrumentId);
    if (bucket) {
      bucket.push(split);
    } else {
      map.set(split.instrumentId, [split]);
    }
  }
  return map;
}

export function splitMultiplierForTrade(
  splits: StockSplitLike[],
  instrumentId: string,
  tradeDate: Date,
  throughDate?: Date,
): Decimal {
  const tradeDay = utcDayStartMs(tradeDate);
  const throughDay = throughDate ? utcDayStartMs(throughDate) : null;
  let multiplier = ONE;

  for (const split of splits) {
    if (split.instrumentId !== instrumentId) continue;
    const splitDay = utcDayStartMs(split.exDate);
    if (splitDay <= tradeDay) continue;
    if (throughDay !== null && splitDay > throughDay) continue;
    multiplier = multiplier.times(splitRatio(split));
  }

  return multiplier;
}

export function adjustQuantityForSplits(
  quantity: Decimal,
  splits: StockSplitLike[],
  instrumentId: string,
  tradeDate: Date,
  throughDate?: Date,
): Decimal {
  const multiplier = splitMultiplierForTrade(
    splits,
    instrumentId,
    tradeDate,
    throughDate,
  );
  return quantity.times(multiplier);
}

export async function loadStockSplits(
  instrumentIds: string[],
): Promise<StockSplitLike[]> {
  const ids = Array.from(new Set(instrumentIds)).filter(Boolean);
  if (ids.length === 0) return [];

  return db.stockSplit.findMany({
    where: { instrumentId: { in: ids } },
    orderBy: [{ instrumentId: "asc" }, { exDate: "asc" }],
  });
}
