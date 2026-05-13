"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ensureTargetHitAlert } from "@/lib/forecast-alerts";
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

  const forecast = await db.instrumentForecast.create({
    data: {
      instrumentId: instrument.id,
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
    instrument.id,
    instrument.symbol,
    analysis.targetPrice,
  );

  revalidatePath(`/stocks/${instrument.yahooSymbol}`);
  return { ok: true };
}

export type UserForecastInput = {
  instrumentId: string;
  targetPrice: number;
  lowCase: number | null;
  highCase: number | null;
  expectedReturn: number | null;
  horizonMonths: number;
  rationale: string;
  documentId: string | null;
};

export async function saveUserForecast(
  input: UserForecastInput,
): Promise<ForecastActionState> {
  const instrument = await db.instrument.findUnique({
    where: { id: input.instrumentId },
  });
  if (!instrument) return { ok: false, error: "Instrument not found" };

  if (!Number.isFinite(input.targetPrice) || input.targetPrice <= 0) {
    return { ok: false, error: "Target price must be positive" };
  }
  if (input.lowCase != null && input.lowCase >= input.targetPrice) {
    return { ok: false, error: "Bear case must be below target" };
  }
  if (input.highCase != null && input.highCase <= input.targetPrice) {
    return { ok: false, error: "Bull case must be above target" };
  }

  const settings = await db.settings.findUnique({ where: { id: "singleton" } });
  const pin = settings?.pinUserForecastsByDefault ?? true;

  // Pinning is one-at-a-time. If the user wants this pinned, clear any existing pin first.
  if (pin) {
    await db.instrumentForecast.updateMany({
      where: { instrumentId: instrument.id, isPinned: true },
      data: { isPinned: false },
    });
  }

  const forecast = await db.instrumentForecast.create({
    data: {
      instrumentId: instrument.id,
      source: "USER",
      isPinned: pin,
      documentId: input.documentId,
      targetPrice: input.targetPrice.toString(),
      lowCase: input.lowCase?.toString() ?? null,
      highCase: input.highCase?.toString() ?? null,
      expectedReturn: input.expectedReturn?.toString() ?? null,
      horizonMonths: input.horizonMonths,
      rationale: input.rationale,
      model: "user",
      reasoningEffort: "manual",
    },
  });

  await ensureTargetHitAlert(
    forecast.id,
    instrument.id,
    instrument.symbol,
    input.targetPrice,
  );

  revalidatePath(`/stocks/${instrument.yahooSymbol}`);
  return { ok: true };
}

export async function pinForecast(
  forecastId: string,
): Promise<ForecastActionState> {
  const forecast = await db.instrumentForecast.findUnique({
    where: { id: forecastId },
    include: { instrument: true },
  });
  if (!forecast) return { ok: false, error: "Forecast not found" };

  await db.$transaction([
    db.instrumentForecast.updateMany({
      where: { instrumentId: forecast.instrumentId, isPinned: true },
      data: { isPinned: false },
    }),
    db.instrumentForecast.update({
      where: { id: forecastId },
      data: { isPinned: true },
    }),
  ]);

  revalidatePath(`/stocks/${forecast.instrument.yahooSymbol}`);
  return { ok: true };
}

export async function unpinForecast(
  forecastId: string,
): Promise<ForecastActionState> {
  const forecast = await db.instrumentForecast.findUnique({
    where: { id: forecastId },
    include: { instrument: true },
  });
  if (!forecast) return { ok: false, error: "Forecast not found" };

  await db.instrumentForecast.update({
    where: { id: forecastId },
    data: { isPinned: false },
  });

  revalidatePath(`/stocks/${forecast.instrument.yahooSymbol}`);
  return { ok: true };
}
