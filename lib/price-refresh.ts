import { BENCHMARK_YAHOO_SYMBOL } from "@/lib/benchmark";
import { db } from "@/lib/db";
import { trackedInstrumentWhere } from "@/lib/tracked-instruments";
import { fetchDailyHistory } from "@/lib/yahoo";

const BACKFILL_DAYS = 7;

export type PriceRefreshTrigger = "cron" | "manual";

export type PriceRefreshFailure = {
  yahooSymbol: string;
  error: string;
};

export type PriceRefreshOutcome = {
  ok: boolean;
  instruments: number;
  bars: number;
  failures: PriceRefreshFailure[];
  error?: string;
};

/**
 * Run the EOD price refresh for tracked instruments and write the result
 * to the given PriceRefreshRun row (created up-front by the caller).
 *
 * Used by both the Coolify cron script and the manual server action.
 * Top-level failures (DB unreachable, etc.) are caught and recorded in
 * the row's `error` field — the function never throws.
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

    let totalBars = 0;
    const failures: PriceRefreshFailure[] = [];

    for (const inst of instruments) {
      try {
        const bars = await fetchDailyHistory(inst.yahooSymbol, from);
        if (bars.length === 0) continue;
        const result = await db.priceHistory.createMany({
          data: bars.map((b) => ({
            instrumentId: inst.id,
            date: b.date,
            open: b.open.toString(),
            high: b.high.toString(),
            low: b.low.toString(),
            close: b.close.toString(),
            volume: b.volume === null ? null : BigInt(Math.trunc(b.volume)),
          })),
          skipDuplicates: true,
        });
        totalBars += result.count;
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
