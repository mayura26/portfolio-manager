"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getFxRate } from "@/lib/fx";
import { findOrCreateInstrument } from "@/lib/instruments";
import { tradeSchema } from "@/lib/validators";

export type TradeActionState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function parseFormData(formData: FormData) {
  return tradeSchema.safeParse({
    portfolioId: formData.get("portfolioId"),
    yahooSymbol: formData.get("yahooSymbol"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    price: formData.get("price"),
    currency: formData.get("currency"),
    fees: formData.get("fees") ?? "0",
    date: formData.get("date"),
    notes: formData.get("notes"),
  });
}

function revalidatePortfolio(portfolioId: string) {
  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath(`/portfolios/${portfolioId}/trades`);
  revalidatePath(`/portfolios`);
  revalidatePath(`/dashboard`);
  revalidatePath(`/stocks`);
}

export async function createTrade(
  _prev: TradeActionState | undefined,
  formData: FormData,
): Promise<TradeActionState> {
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const data = parsed.data;
  const portfolio = await db.portfolio.findUnique({ where: { id: data.portfolioId } });
  if (!portfolio) {
    return { ok: false, error: "Portfolio not found" };
  }

  let instrument;
  try {
    instrument = await findOrCreateInstrument(data.yahooSymbol);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not look up instrument" };
  }

  const tradeCurrency = data.currency.toUpperCase();
  let fxRate: string | null = null;
  if (tradeCurrency !== portfolio.baseCurrency) {
    try {
      const rate = await getFxRate(tradeCurrency, portfolio.baseCurrency, data.date);
      fxRate = rate.toString();
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Unable to fetch FX rate for this trade",
      };
    }
  }

  await db.trade.create({
    data: {
      portfolioId: data.portfolioId,
      instrumentId: instrument.id,
      type: data.type,
      quantity: data.quantity,
      price: data.price,
      currency: tradeCurrency,
      fxRate,
      fees: data.fees ?? "0",
      date: data.date,
      notes: data.notes,
    },
  });

  revalidatePortfolio(data.portfolioId);
  redirect(`/portfolios/${data.portfolioId}/trades`);
}

export async function updateTrade(
  tradeId: string,
  _prev: TradeActionState | undefined,
  formData: FormData,
): Promise<TradeActionState> {
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const data = parsed.data;
  const trade = await db.trade.findUnique({
    where: { id: tradeId },
    include: { portfolio: true },
  });
  if (!trade) return { ok: false, error: "Trade not found" };
  if (trade.portfolioId !== data.portfolioId) {
    return { ok: false, error: "Cannot move trade between portfolios" };
  }

  let instrument;
  try {
    instrument = await findOrCreateInstrument(data.yahooSymbol);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not look up instrument" };
  }

  const tradeCurrency = data.currency.toUpperCase();
  let fxRate: string | null = null;
  if (tradeCurrency !== trade.portfolio.baseCurrency) {
    try {
      const rate = await getFxRate(tradeCurrency, trade.portfolio.baseCurrency, data.date);
      fxRate = rate.toString();
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Unable to fetch FX rate for this trade",
      };
    }
  }

  await db.trade.update({
    where: { id: tradeId },
    data: {
      instrumentId: instrument.id,
      type: data.type,
      quantity: data.quantity,
      price: data.price,
      currency: tradeCurrency,
      fxRate,
      fees: data.fees ?? "0",
      date: data.date,
      notes: data.notes,
    },
  });

  revalidatePortfolio(data.portfolioId);
  return { ok: true };
}

export async function deleteTrade(tradeId: string): Promise<void> {
  const trade = await db.trade.findUnique({ where: { id: tradeId } });
  if (!trade) return;
  await db.trade.delete({ where: { id: tradeId } });
  revalidatePortfolio(trade.portfolioId);
  redirect(`/portfolios/${trade.portfolioId}/trades`);
}
