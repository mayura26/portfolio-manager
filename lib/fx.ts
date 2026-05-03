import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { fetchFxRate as fetchFxRateFromYahoo } from "@/lib/yahoo";

function pairKey(from: string, to: string): string {
  return `${from.toUpperCase()}${to.toUpperCase()}`;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

/**
 * Convert an amount from one currency to another using the rate on `asOf`
 * (or the latest available rate if no entry exists for that exact date).
 */
export async function convert(
  amount: Decimal | string | number,
  from: string,
  to: string,
  asOf: Date = new Date(),
): Promise<Decimal> {
  const value = amount instanceof Decimal ? amount : new Decimal(amount);
  if (from.toUpperCase() === to.toUpperCase()) return value;
  const rate = await getFxRate(from, to, asOf);
  return value.times(rate);
}

/**
 * Resolve an FX rate. Tries DB for `asOf` (or latest before), then falls back
 * to Yahoo and upserts the result so subsequent calls are local.
 */
export async function getFxRate(
  from: string,
  to: string,
  asOf: Date = new Date(),
): Promise<Decimal> {
  if (from.toUpperCase() === to.toUpperCase()) return new Decimal(1);

  const pair = pairKey(from, to);
  const day = startOfDay(asOf);

  const stored = await db.fxRate.findFirst({
    where: { pair, date: { lte: day } },
    orderBy: { date: "desc" },
  });
  if (stored) return new Decimal(stored.rate.toString());

  const live = await fetchFxRateFromYahoo(pair);
  if (live === null) {
    throw new Error(`Unable to resolve FX rate for ${from} -> ${to}`);
  }

  const rate = new Decimal(live);
  await db.fxRate.upsert({
    where: { pair_date: { pair, date: day } },
    create: { pair, date: day, rate: rate.toString() },
    update: { rate: rate.toString() },
  });

  return rate;
}

export async function upsertFxRate(
  from: string,
  to: string,
  date: Date,
  rate: Decimal | string | number,
): Promise<void> {
  const pair = pairKey(from, to);
  const day = startOfDay(date);
  const value = (rate instanceof Decimal ? rate : new Decimal(rate)).toString();
  await db.fxRate.upsert({
    where: { pair_date: { pair, date: day } },
    create: { pair, date: day, rate: value },
    update: { rate: value },
  });
}
