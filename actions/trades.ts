"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getFxRate } from "@/lib/fx";
import { findOrCreateInstrument } from "@/lib/instruments";
import { visibleTradeWhere } from "@/lib/portfolio-visibility";
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
  const portfolio = await db.portfolio.findUnique({
    where: { id: data.portfolioId },
  });
  if (!portfolio) {
    return { ok: false, error: "Portfolio not found" };
  }

  let instrument: Awaited<ReturnType<typeof findOrCreateInstrument>>;
  try {
    instrument = await findOrCreateInstrument(data.yahooSymbol);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Could not look up instrument",
    };
  }

  const tradeCurrency = data.currency.toUpperCase();
  let fxRate: string | null = null;
  if (tradeCurrency !== portfolio.baseCurrency) {
    try {
      const rate = await getFxRate(
        tradeCurrency,
        portfolio.baseCurrency,
        data.date,
      );
      fxRate = rate.toString();
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Unable to fetch FX rate for this trade",
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

  let instrument: Awaited<ReturnType<typeof findOrCreateInstrument>>;
  try {
    instrument = await findOrCreateInstrument(data.yahooSymbol);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Could not look up instrument",
    };
  }

  const tradeCurrency = data.currency.toUpperCase();
  let fxRate: string | null = null;
  if (tradeCurrency !== trade.portfolio.baseCurrency) {
    try {
      const rate = await getFxRate(
        tradeCurrency,
        trade.portfolio.baseCurrency,
        data.date,
      );
      fxRate = rate.toString();
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Unable to fetch FX rate for this trade",
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

// ── Trade reassignment ──────────────────────────────────────────────────────

export type MoveTradesResult =
  | { ok: true; moved: number }
  | { ok: false; error: string };

export type TradeVisibilityResult =
  | { ok: true; changed: number }
  | { ok: false; error: string };

function revalidateAfterMove(portfolioIds: string[], groupIds: string[]) {
  for (const pid of new Set(portfolioIds)) {
    revalidatePath(`/portfolios/${pid}`);
    revalidatePath(`/portfolios/${pid}/trades`);
  }
  for (const gid of new Set(groupIds)) {
    revalidatePath(`/groups/${gid}`);
    revalidatePath(`/groups/${gid}/cash`);
  }
  revalidatePath("/portfolios");
  revalidatePath("/groups");
  revalidatePath("/dashboard");
  revalidatePath("/stocks");
  revalidatePath("/reviews/audit");
}

async function loadTradesForVisibilityChange(tradeIds: string[]) {
  const ids = [...new Set(tradeIds)];
  if (ids.length === 0) {
    return { ok: false as const, error: "Select at least one trade." };
  }

  const trades = await db.trade.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      portfolioId: true,
      portfolio: { select: { name: true, groupId: true } },
    },
  });

  if (trades.length !== ids.length) {
    return {
      ok: false as const,
      error: "Some selected trades were not found.",
    };
  }

  if (trades.some((t) => t.portfolio.name !== "Unassigned")) {
    return {
      ok: false as const,
      error: "Only trades in an Unassigned portfolio can be hidden.",
    };
  }

  return { ok: true as const, ids, trades };
}

export async function hideTrades(
  tradeIds: string[],
): Promise<TradeVisibilityResult> {
  const loaded = await loadTradesForVisibilityChange(tradeIds);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const result = await db.trade.updateMany({
    where: {
      id: { in: loaded.ids },
      ...visibleTradeWhere,
      portfolio: { name: "Unassigned" },
    },
    data: { isHidden: true, hiddenAt: new Date() },
  });

  revalidateAfterMove(
    loaded.trades.map((t) => t.portfolioId),
    loaded.trades.map((t) => t.portfolio.groupId),
  );

  return { ok: true, changed: result.count };
}

export async function restoreTrades(
  tradeIds: string[],
): Promise<TradeVisibilityResult> {
  const loaded = await loadTradesForVisibilityChange(tradeIds);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const result = await db.trade.updateMany({
    where: {
      id: { in: loaded.ids },
      isHidden: true,
      portfolio: { name: "Unassigned" },
    },
    data: { isHidden: false, hiddenAt: null },
  });

  revalidateAfterMove(
    loaded.trades.map((t) => t.portfolioId),
    loaded.trades.map((t) => t.portfolio.groupId),
  );

  return { ok: true, changed: result.count };
}

/**
 * Move a set of trades to `targetPortfolioId`. FX rates are recomputed against
 * the target portfolio's base currency. If any trade with an `externalRef`
 * would collide with an existing one in the target (the @@unique constraint),
 * the entire move is rejected so the caller can decide how to resolve it.
 */
export async function moveTrades(
  tradeIds: string[],
  targetPortfolioId: string,
): Promise<MoveTradesResult> {
  if (tradeIds.length === 0) {
    return { ok: false, error: "Select at least one trade to move." };
  }

  const target = await db.portfolio.findUnique({
    where: { id: targetPortfolioId },
    select: { id: true, groupId: true, baseCurrency: true },
  });
  if (!target) return { ok: false, error: "Target portfolio not found." };

  const trades = await db.trade.findMany({
    where: { id: { in: tradeIds }, ...visibleTradeWhere },
    select: {
      id: true,
      currency: true,
      date: true,
      externalRef: true,
      portfolioId: true,
      portfolio: { select: { groupId: true } },
    },
  });

  if (trades.length === 0) {
    return { ok: false, error: "No matching trades found." };
  }

  const toMove = trades.filter((t) => t.portfolioId !== target.id);

  if (toMove.length === 0) {
    return {
      ok: false,
      error: "All selected trades already live in the target portfolio.",
    };
  }

  // Pre-check externalRef conflicts so we fail cleanly instead of mid-transaction.
  const refsToMove = toMove
    .map((t) => t.externalRef)
    .filter((r): r is string => Boolean(r));
  if (refsToMove.length > 0) {
    const conflicting = await db.trade.findMany({
      where: {
        portfolioId: target.id,
        externalRef: { in: refsToMove },
        id: { notIn: toMove.map((t) => t.id) },
      },
      select: { externalRef: true },
    });
    if (conflicting.length > 0) {
      const refs = conflicting
        .map((c) => c.externalRef)
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");
      return {
        ok: false,
        error: `Target portfolio already has matching imported trades (${refs}${conflicting.length > 3 ? "…" : ""}). Move would create duplicates.`,
      };
    }
  }

  // Resolve all required FX rates up-front to keep the transaction tight.
  const fxKey = (currency: string, date: Date) =>
    `${currency.toUpperCase()}|${date.toISOString().split("T")[0]}`;
  const neededRates = new Map<
    string,
    { currency: string; date: Date; rate: string | null }
  >();
  for (const t of toMove) {
    const key = fxKey(t.currency, t.date);
    if (neededRates.has(key)) continue;
    if (t.currency.toUpperCase() === target.baseCurrency.toUpperCase()) {
      neededRates.set(key, { currency: t.currency, date: t.date, rate: null });
      continue;
    }
    try {
      const rate = await getFxRate(t.currency, target.baseCurrency, t.date);
      neededRates.set(key, {
        currency: t.currency,
        date: t.date,
        rate: rate.toString(),
      });
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? `FX lookup failed for ${t.currency} → ${target.baseCurrency}: ${err.message}`
            : "FX lookup failed",
      };
    }
  }

  const sourcePortfolioIds = [...new Set(toMove.map((t) => t.portfolioId))];
  const sourceGroupIds = [...new Set(toMove.map((t) => t.portfolio.groupId))];

  await db.$transaction(
    toMove.map((t) =>
      db.trade.update({
        where: { id: t.id },
        data: {
          portfolioId: target.id,
          fxRate: neededRates.get(fxKey(t.currency, t.date))?.rate ?? null,
        },
      }),
    ),
  );

  revalidateAfterMove(
    [...sourcePortfolioIds, target.id],
    [...sourceGroupIds, target.groupId],
  );

  return { ok: true, moved: toMove.length };
}

/**
 * Move every trade in `sourcePortfolioId` whose instrument matches `instrumentId`
 * to `targetPortfolioId`. Convenience wrapper around `moveTrades` for the
 * "move all of $SYMBOL" UX.
 */
export async function moveTradesBySymbol(
  sourcePortfolioId: string,
  instrumentId: string,
  targetPortfolioId: string,
): Promise<MoveTradesResult> {
  if (sourcePortfolioId === targetPortfolioId) {
    return {
      ok: false,
      error: "Source and target portfolios are the same.",
    };
  }

  const trades = await db.trade.findMany({
    where: {
      portfolioId: sourcePortfolioId,
      instrumentId,
      ...visibleTradeWhere,
    },
    select: { id: true },
  });

  if (trades.length === 0) {
    return {
      ok: false,
      error: "No trades found for that symbol in this portfolio.",
    };
  }

  return moveTrades(
    trades.map((t) => t.id),
    targetPortfolioId,
  );
}
