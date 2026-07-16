import { BENCHMARK_YAHOO_SYMBOL } from "@/lib/benchmark";
import { db } from "@/lib/db";
import { trackedInstrumentWhere } from "@/lib/tracked-instruments";
import {
  type DailyBar,
  fetchDailyHistory,
  fetchStockSplits,
  type StockSplitEvent,
} from "@/lib/yahoo";

const BACKFILL_DAYS = 7;
const PRICE_REPAIR_DAYS = 3650;
const SPLIT_LOOKBACK_DAYS = PRICE_REPAIR_DAYS;

export type PriceRefreshTrigger = "cron" | "manual";

export type PriceRefreshFailure = {
  yahooSymbol: string;
  error: string;
};

export type PriceRefreshOutcome = {
  ok: boolean;
  instruments: number;
  bars: number;
  splits: number;
  repairedPriceHistories: number;
  failures: PriceRefreshFailure[];
  error?: string;
};

function utcDateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function dayKey(date: Date): string {
  return utcDateOnly(date).toISOString().slice(0, 10);
}

function priceData(instrumentId: string, bar: DailyBar) {
  return {
    instrumentId,
    date: utcDateOnly(bar.date),
    open: bar.open.toString(),
    high: bar.high.toString(),
    low: bar.low.toString(),
    close: bar.close.toString(),
    volume: bar.volume === null ? null : BigInt(Math.trunc(bar.volume)),
  };
}

async function upsertPriceBars(
  instrumentId: string,
  bars: DailyBar[],
): Promise<number> {
  if (bars.length === 0) return 0;

  const dates = bars.map((bar) => utcDateOnly(bar.date));
  const existing = await db.priceHistory.findMany({
    where: { instrumentId, date: { in: dates } },
    select: { date: true },
  });
  const existingDays = new Set(existing.map((row) => dayKey(row.date)));
  const inserted = dates.filter(
    (date) => !existingDays.has(dayKey(date)),
  ).length;

  const operations = bars.map((bar) => {
    const data = priceData(instrumentId, bar);
    return db.priceHistory.upsert({
      where: {
        instrumentId_date: {
          instrumentId,
          date: data.date,
        },
      },
      create: data,
      update: {
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: data.volume,
      },
    });
  });

  for (let i = 0; i < operations.length; i += 100) {
    await db.$transaction(operations.slice(i, i + 100));
  }

  return inserted;
}

async function persistStockSplits(
  instrumentId: string,
  splits: StockSplitEvent[],
): Promise<number> {
  if (splits.length === 0) return 0;

  const result = await db.stockSplit.createMany({
    data: splits.map((split) => ({
      instrumentId,
      exDate: utcDateOnly(split.date),
      numerator: split.numerator.toString(),
      denominator: split.denominator.toString(),
      source: "YAHOO",
    })),
    skipDuplicates: true,
  });

  return result.count;
}

async function repairStartDate(instrumentId: string): Promise<Date> {
  const [earliestPrice, earliestTrade] = await Promise.all([
    db.priceHistory.findFirst({
      where: { instrumentId },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    db.trade.findFirst({
      where: { instrumentId },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
  ]);

  const fallback = new Date();
  fallback.setUTCDate(fallback.getUTCDate() - PRICE_REPAIR_DAYS);

  const candidates = [
    earliestPrice?.date,
    earliestTrade?.date,
    fallback,
  ].filter((date): date is Date => Boolean(date));
  return new Date(
    Math.min(...candidates.map((date) => utcDateOnly(date).getTime())),
  );
}

/**
 * Run the EOD price refresh for tracked instruments and write the result
 * to the given PriceRefreshRun row (created up-front by the caller).
 *
 * Used by both the Coolify cron script and the manual server action.
 * Top-level failures (DB unreachable, etc.) are caught and recorded in
 * the row's `error` field - the function never throws.
 */
export async function executePriceRefreshIntoRun(
  runId: string,
): Promise<PriceRefreshOutcome> {
  try {
    const instruments = await db.instrument.findMany({
      where: {
        OR: [trackedInstrumentWhere, { yahooSymbol: BENCHMARK_YAHOO_SYMBOL }],
      },
      select: { id: true, yahooSymbol: true },
    });

    if (instruments.length === 0) {
      const empty: PriceRefreshOutcome = {
        ok: true,
        instruments: 0,
        bars: 0,
        splits: 0,
        repairedPriceHistories: 0,
        failures: [],
      };
      await db.priceRefreshRun.update({
        where: { id: runId },
        data: {
          finishedAt: new Date(),
          ok: true,
          instruments: 0,
          bars: 0,
          failures: [],
        },
      });
      return empty;
    }

    const from = new Date();
    from.setUTCDate(from.getUTCDate() - BACKFILL_DAYS);
    const splitFrom = new Date();
    splitFrom.setUTCDate(splitFrom.getUTCDate() - SPLIT_LOOKBACK_DAYS);

    let totalBars = 0;
    let totalSplits = 0;
    let repairedPriceHistories = 0;
    const failures: PriceRefreshFailure[] = [];

    for (const inst of instruments) {
      try {
        const [bars, splits] = await Promise.all([
          fetchDailyHistory(inst.yahooSymbol, from),
          fetchStockSplits(inst.yahooSymbol, splitFrom),
        ]);

        totalBars += await upsertPriceBars(inst.id, bars);

        const insertedSplits = await persistStockSplits(inst.id, splits);
        totalSplits += insertedSplits;

        if (insertedSplits > 0) {
          const repairFrom = await repairStartDate(inst.id);
          const repairedBars = await fetchDailyHistory(
            inst.yahooSymbol,
            repairFrom,
          );
          await upsertPriceBars(inst.id, repairedBars);
          repairedPriceHistories += 1;
        }
      } catch (err) {
        failures.push({
          yahooSymbol: inst.yahooSymbol,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await db.priceRefreshRun.update({
      where: { id: runId },
      data: {
        finishedAt: new Date(),
        ok: true,
        instruments: instruments.length,
        bars: totalBars,
        failures,
      },
    });

    return {
      ok: true,
      instruments: instruments.length,
      bars: totalBars,
      splits: totalSplits,
      repairedPriceHistories,
      failures,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await db.priceRefreshRun.update({
        where: { id: runId },
        data: {
          finishedAt: new Date(),
          ok: false,
          error: message,
        },
      });
    } catch {
      // If we can't even write the failure, the cron logger will surface it.
    }
    return {
      ok: false,
      instruments: 0,
      bars: 0,
      splits: 0,
      repairedPriceHistories: 0,
      failures: [],
      error: message,
    };
  }
}

/**
 * Create a PriceRefreshRun row and run the refresh against it.
 * Used by the cron entry point. The server action creates the row
 * separately and calls `executePriceRefreshIntoRun` directly so the
 * action can return before the work finishes.
 */
export async function runPriceRefresh(
  trigger: PriceRefreshTrigger,
): Promise<{ runId: string; outcome: PriceRefreshOutcome }> {
  const run = await db.priceRefreshRun.create({
    data: { trigger, ok: false },
  });
  const outcome = await executePriceRefreshIntoRun(run.id);
  return { runId: run.id, outcome };
}
