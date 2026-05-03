"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Prisma } from "@/app/generated/prisma/client";
import { watchlistItemSchema, buyRangeSchema } from "@/lib/validators";
import { findOrCreateInstrument } from "@/lib/instruments";
import { fetchFinancialSummary, fetchDailyHistory, fetchQuotes } from "@/lib/yahoo";
import { analyzeWatchlistBuyZone } from "@/lib/watchlist-ai";

export type WatchlistActionState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const str = value.toString().trim();
  return str.length === 0 ? null : str;
}

function revalidateAll() {
  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
}

async function createWatchlistAlert(instrumentId: string, symbol: string, buyRangeHigh: string) {
  const alert = await db.alert.create({
    data: {
      type: "PRICE_BELOW",
      priceDirection: "below",
      instrumentId,
      priceTarget: buyRangeHigh,
      message: `Watchlist: ${symbol} entered buy zone`,
    },
  });
  return alert.id;
}

export async function addToWatchlist(
  _prev: WatchlistActionState | undefined,
  formData: FormData,
): Promise<WatchlistActionState> {
  const yahooSymbol = emptyToNull(formData.get("yahooSymbol"));
  if (!yahooSymbol) {
    return { ok: false, error: "Please select a stock" };
  }

  let instrument: Awaited<ReturnType<typeof findOrCreateInstrument>>;
  try {
    instrument = await findOrCreateInstrument(yahooSymbol);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not resolve instrument",
    };
  }

  const parsed = watchlistItemSchema.safeParse({
    yahooSymbol,
    buyRangeLow: emptyToNull(formData.get("buyRangeLow")),
    buyRangeHigh: emptyToNull(formData.get("buyRangeHigh")),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const data = parsed.data;

  // Check for existing entry — upsert back to WATCHING if archived/bought
  const existing = await db.watchlistItem.findUnique({
    where: { instrumentId: instrument.id },
  });

  let alertId: string | null = existing?.alertId ?? null;

  // If re-activating, clean up old alert
  if (existing && alertId) {
    await db.alert.delete({ where: { id: alertId } }).catch(() => {});
    alertId = null;
  }

  if (data.buyRangeHigh) {
    alertId = await createWatchlistAlert(instrument.id, instrument.symbol, data.buyRangeHigh);
  }

  await db.watchlistItem.upsert({
    where: { instrumentId: instrument.id },
    create: {
      instrumentId: instrument.id,
      status: "WATCHING",
      buyRangeLow: data.buyRangeLow ?? null,
      buyRangeHigh: data.buyRangeHigh ?? null,
      notes: data.notes ?? null,
      alertId,
    },
    update: {
      status: "WATCHING",
      buyRangeLow: data.buyRangeLow ?? null,
      buyRangeHigh: data.buyRangeHigh ?? null,
      notes: data.notes ?? null,
      alertId,
      aiAnalysis: Prisma.DbNull,
    },
  });

  revalidateAll();
  redirect("/watchlist");
}

export async function analyzeWatchlistItem(itemId: string): Promise<WatchlistActionState> {
  const item = await db.watchlistItem.findUnique({
    where: { id: itemId },
    include: { instrument: true },
  });

  if (!item) return { ok: false, error: "Watchlist item not found" };

  const { instrument } = item;

  const financials = await fetchFinancialSummary(instrument.yahooSymbol);
  if (!financials) {
    return { ok: false, error: "Could not fetch fundamentals for analysis" };
  }

  const from = new Date();
  from.setDate(from.getDate() - 90);
  const recentBars = await fetchDailyHistory(instrument.yahooSymbol, from);

  const quotes = await fetchQuotes([instrument.yahooSymbol]);
  const quote = quotes[0];
  if (!quote) {
    return { ok: false, error: "Could not fetch current price for analysis" };
  }

  const settings = await db.settings.findUnique({ where: { id: "singleton" } });
  const model = settings?.watchlistAiModel ?? "gpt-5.4";
  const reasoningEffort =
    (settings?.watchlistAiReasoning as "minimal" | "low" | "medium" | "high" | undefined) ??
    "medium";

  let analysis: Awaited<ReturnType<typeof analyzeWatchlistBuyZone>>;
  try {
    analysis = await analyzeWatchlistBuyZone({
      symbol: instrument.symbol,
      name: instrument.name,
      currency: instrument.currency,
      currentPrice: quote.price,
      financials,
      recentBars,
      model,
      reasoningEffort,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `AI analysis failed: ${err.message}` : "AI analysis failed",
    };
  }

  // If no buy range set yet, apply AI suggestion and create alert
  let alertId = item.alertId;
  if (!item.buyRangeHigh) {
    if (alertId) {
      await db.alert.delete({ where: { id: alertId } }).catch(() => {});
    }
    alertId = await createWatchlistAlert(
      instrument.id,
      instrument.symbol,
      analysis.suggestedHigh.toFixed(4),
    );
  }

  await db.watchlistItem.update({
    where: { id: itemId },
    data: {
      aiAnalysis: analysis,
      ...(!item.buyRangeHigh
        ? {
            buyRangeLow: analysis.suggestedLow.toFixed(4),
            buyRangeHigh: analysis.suggestedHigh.toFixed(4),
            alertId,
          }
        : {}),
    },
  });

  revalidateAll();
  return { ok: true };
}

export async function setBuyRange(
  itemId: string,
  _prev: WatchlistActionState | undefined,
  formData: FormData,
): Promise<WatchlistActionState> {
  const parsed = buyRangeSchema.safeParse({
    buyRangeLow: emptyToNull(formData.get("buyRangeLow")),
    buyRangeHigh: emptyToNull(formData.get("buyRangeHigh")),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const item = await db.watchlistItem.findUnique({
    where: { id: itemId },
    include: { instrument: true },
  });
  if (!item) return { ok: false, error: "Watchlist item not found" };

  // Delete old alert before creating new one
  if (item.alertId) {
    await db.alert.delete({ where: { id: item.alertId } }).catch(() => {});
  }

  const alertId = await createWatchlistAlert(
    item.instrumentId,
    item.instrument.symbol,
    parsed.data.buyRangeHigh,
  );

  await db.watchlistItem.update({
    where: { id: itemId },
    data: {
      buyRangeLow: parsed.data.buyRangeLow,
      buyRangeHigh: parsed.data.buyRangeHigh,
      alertId,
    },
  });

  revalidateAll();
  return { ok: true };
}

export async function archiveWatchlistItem(itemId: string): Promise<void> {
  const item = await db.watchlistItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  if (item.alertId) {
    await db.alert.update({
      where: { id: item.alertId },
      data: { status: "DISMISSED" },
    }).catch(() => {});
  }

  await db.watchlistItem.update({
    where: { id: itemId },
    data: { status: "ARCHIVED" },
  });

  revalidateAll();
}

export async function markAsBought(itemId: string): Promise<void> {
  const item = await db.watchlistItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  if (item.alertId) {
    await db.alert.update({
      where: { id: item.alertId },
      data: { status: "DISMISSED" },
    }).catch(() => {});
  }

  await db.watchlistItem.update({
    where: { id: itemId },
    data: { status: "BOUGHT" },
  });

  revalidateAll();
  redirect("/portfolios");
}

export async function deleteWatchlistItem(itemId: string): Promise<void> {
  const item = await db.watchlistItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  if (item.alertId) {
    await db.alert.delete({ where: { id: item.alertId } }).catch(() => {});
  }

  await db.watchlistItem.delete({ where: { id: itemId } });

  revalidateAll();
}
