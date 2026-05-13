/**
 * Weekly AI forecast refresh — for every instrument that is held, watchlisted,
 * or targeted by a portfolio, generate a fresh InstrumentForecast. Run as a
 * Coolify scheduled task (weekly):
 *   npm run cron:forecasts
 */
import "dotenv/config";
import { ensureTargetHitAlert } from "@/actions/forecasts";
import { db } from "@/lib/db";
import { analyzeStockForecast } from "@/lib/forecasts";
import {
  fetchDailyHistory,
  fetchFinancialSummary,
  fetchQuotes,
} from "@/lib/yahoo";

async function run() {
  const settings = await db.settings.findUnique({ where: { id: "singleton" } });
  const model = settings?.watchlistAiModel ?? "gpt-5.4";
  const reasoningEffort =
    (settings?.watchlistAiReasoning as
      | "minimal"
      | "low"
      | "medium"
      | "high"
      | undefined) ?? "medium";

  // Union of relevant instruments: traded, watchlisted, or targeted.
  const [tradedRows, watchlistRows, targetRows] = await Promise.all([
    db.trade.findMany({
      select: { instrumentId: true },
      distinct: ["instrumentId"],
    }),
    db.watchlistItem.findMany({
      where: { status: "WATCHING" },
      select: { instrumentId: true },
    }),
    db.portfolioTarget.findMany({ select: { instrumentId: true } }),
  ]);

  const ids = new Set<string>();
  for (const r of tradedRows) ids.add(r.instrumentId);
  for (const r of watchlistRows) ids.add(r.instrumentId);
  for (const r of targetRows) ids.add(r.instrumentId);

  if (ids.size === 0) {
    return { ok: true, instruments: 0, generated: 0, failures: [] };
  }

  const instruments = await db.instrument.findMany({
    where: { id: { in: Array.from(ids) } },
  });

  const from = new Date();
  from.setDate(from.getDate() - 90);

  let generated = 0;
  const failures: { yahooSymbol: string; error: string }[] = [];

  for (const inst of instruments) {
    try {
      const financials = await fetchFinancialSummary(inst.yahooSymbol);
      if (!financials) {
        failures.push({
          yahooSymbol: inst.yahooSymbol,
          error: "no fundamentals",
        });
        continue;
      }
      const recentBars = await fetchDailyHistory(inst.yahooSymbol, from);
      const quotes = await fetchQuotes([inst.yahooSymbol]);
      const quote = quotes[0];
      if (!quote) {
        failures.push({
          yahooSymbol: inst.yahooSymbol,
          error: "no current price",
        });
        continue;
      }

      const analysis = await analyzeStockForecast({
        symbol: inst.symbol,
        name: inst.name,
        currency: inst.currency,
        currentPrice: quote.price,
        financials,
        recentBars,
        model,
        reasoningEffort,
        horizonMonths: 12,
      });

      const forecast = await db.instrumentForecast.create({
        data: {
          instrumentId: inst.id,
          source: "AI",
          targetPrice: analysis.targetPrice.toString(),
          lowCase: analysis.lowCase.toString(),
          highCase: analysis.highCase.toString(),
          expectedReturn: analysis.expectedReturn.toString(),
          horizonMonths: analysis.horizonMonths,
          rationale: analysis.rationale,
          model,
          reasoningEffort,
          streetTargetMean: financials.targetMeanPrice?.toString() ?? null,
          streetTargetHigh: financials.targetHighPrice?.toString() ?? null,
          streetTargetLow: financials.targetLowPrice?.toString() ?? null,
          streetRecommendation: financials.recommendationKey ?? null,
          streetNumberOfAnalysts: financials.numberOfAnalystOpinions ?? null,
        },
      });
      await ensureTargetHitAlert(
        forecast.id,
        inst.id,
        inst.symbol,
        analysis.targetPrice,
      );
      generated++;
    } catch (err) {
      failures.push({
        yahooSymbol: inst.yahooSymbol,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: true,
    instruments: instruments.length,
    generated,
    failures,
  };
}

run()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.failures.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("[cron-forecasts] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
