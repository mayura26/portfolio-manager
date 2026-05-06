"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { analyzeStockForecast } from "@/lib/forecasts";
import {
  fetchDailyHistory,
  fetchFinancialSummary,
  fetchQuotes,
} from "@/lib/yahoo";

export type ForecastActionState = { ok: true } | { ok: false; error: string };

export async function generateStockForecast(
  instrumentId: string,
): Promise<ForecastActionState> {
  const instrument = await db.instrument.findUnique({
    where: { id: instrumentId },
  });
  if (!instrument) return { ok: false, error: "Instrument not found" };

  const financials = await fetchFinancialSummary(instrument.yahooSymbol);
  if (!financials) {
    return { ok: false, error: "Could not fetch fundamentals for forecast" };
  }

  const from = new Date();
  from.setDate(from.getDate() - 90);
  const recentBars = await fetchDailyHistory(instrument.yahooSymbol, from);

  const quotes = await fetchQuotes([instrument.yahooSymbol]);
  const quote = quotes[0];
  if (!quote) {
    return { ok: false, error: "Could not fetch current price for forecast" };
  }

  const settings = await db.settings.findUnique({ where: { id: "singleton" } });
  const model = settings?.watchlistAiModel ?? "gpt-5.4";
  const reasoningEffort =
    (settings?.watchlistAiReasoning as
      | "minimal"
      | "low"
      | "medium"
      | "high"
      | undefined) ?? "medium";

  let analysis: Awaited<ReturnType<typeof analyzeStockForecast>>;
  try {
    analysis = await analyzeStockForecast({
      symbol: instrument.symbol,
      name: instrument.name,
      currency: instrument.currency,
      currentPrice: quote.price,
      financials,
      recentBars,
      model,
      reasoningEffort,
      horizonMonths: 12,
    });
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Forecast generation failed: ${err.message}`
          : "Forecast generation failed",
    };
  }

  await db.instrumentForecast.create({
    data: {
      instrumentId: instrument.id,
      targetPrice: analysis.targetPrice.toString(),
      lowCase: analysis.lowCase.toString(),
      highCase: analysis.highCase.toString(),
      expectedReturn: analysis.expectedReturn.toString(),
      horizonMonths: analysis.horizonMonths,
      rationale: analysis.rationale,
      model,
      reasoningEffort,
    },
  });

  revalidatePath(`/stocks/${instrument.yahooSymbol}`);
  return { ok: true };
}
