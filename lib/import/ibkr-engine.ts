import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { getFxRate } from "@/lib/fx";
import { findOrCreateInstrument } from "@/lib/instruments";
import type { ParsedTrade } from "./ibkr-csv";

export type ImportResult = {
  inserted: number;
  skipped: number;
  failed: { symbol: string; reason: string }[];
};

// ─── Group-based import (Flex sync) ──────────────────────────────────────────

async function getOrCreateUnassignedPortfolio(
  groupId: string,
  baseCurrency: string,
) {
  const existing = await db.portfolio.findFirst({
    where: { groupId, name: "Unassigned" },
  });
  if (existing) return existing;
  return db.portfolio.create({
    data: { groupId, name: "Unassigned", baseCurrency },
  });
}

/**
 * Import trades into a portfolio group, routing each symbol to whichever
 * portfolio already owns it. New symbols go to an "Unassigned" portfolio.
 */
export async function importToGroup(
  trades: ParsedTrade[],
  groupId: string,
): Promise<ImportResult> {
  const failed: { symbol: string; reason: string }[] = [];

  if (trades.length === 0) return { inserted: 0, skipped: 0, failed: [] };

  const group = await db.portfolioGroup.findUnique({
    where: { id: groupId },
    select: {
      baseCurrency: true,
      portfolios: { select: { id: true, baseCurrency: true } },
    },
  });
  if (!group) throw new Error("Portfolio group not found");

  const portfolioIds = group.portfolios.map((p) => p.id);
  const portfolioCurrencyMap = new Map(
    group.portfolios.map((p) => [p.id, p.baseCurrency]),
  );

  // Build instrumentId → portfolioId ownership map from existing trades
  const ownershipMap = new Map<string, string>();
  if (portfolioIds.length > 0) {
    const existing = await db.trade.findMany({
      where: { portfolioId: { in: portfolioIds } },
      select: { portfolioId: true, instrumentId: true },
      distinct: ["portfolioId", "instrumentId"],
    });
    for (const row of existing) {
      ownershipMap.set(row.instrumentId, row.portfolioId);
    }
  }

  // Pre-resolve all unique symbols
  const uniqueSymbols = [...new Set(trades.map((t) => t.symbol))];
  const instrumentMap = new Map<string, { id: string }>();

  for (const symbol of uniqueSymbols) {
    try {
      const inst = await findOrCreateInstrument(symbol);
      instrumentMap.set(symbol, inst);
    } catch (err) {
      failed.push({
        symbol,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Determine target portfolio per trade and collect needed FX pairs
  type ResolvedTrade = {
    trade: ParsedTrade;
    instrumentId: string;
    portfolioId: string;
    portfolioBaseCurrency: string;
  };

  let unassigned: { id: string; baseCurrency: string } | null = null;
  const resolved: ResolvedTrade[] = [];

  for (const trade of trades) {
    const instrument = instrumentMap.get(trade.symbol);
    if (!instrument) continue;

    let portfolioId = ownershipMap.get(instrument.id);
    let portfolioBaseCurrency: string;

    if (portfolioId) {
      portfolioBaseCurrency = portfolioCurrencyMap.get(portfolioId) ?? group.baseCurrency;
    } else {
      // New symbol — route to Unassigned portfolio (create once)
      if (!unassigned) {
        unassigned = await getOrCreateUnassignedPortfolio(groupId, group.baseCurrency);
        // Add to ownership tracking so subsequent trades of same symbol also route here
        portfolioCurrencyMap.set(unassigned.id, unassigned.baseCurrency);
      }
      portfolioId = unassigned.id;
      portfolioBaseCurrency = unassigned.baseCurrency;
      ownershipMap.set(instrument.id, portfolioId);
    }

    resolved.push({ trade, instrumentId: instrument.id, portfolioId, portfolioBaseCurrency });
  }

  // Pre-fetch FX rates for all unique (tradeCurrency, baseCurrency, date) triplets
  const fxCache = new Map<string, Decimal>();
  const uniqueFxKeys = [
    ...new Set(
      resolved.map(
        (r) =>
          `${r.trade.currency}|${r.portfolioBaseCurrency}|${r.trade.date.toISOString().split("T")[0]}`,
      ),
    ),
  ];

  for (const key of uniqueFxKeys) {
    const [from, to, dateStr] = key.split("|");
    if (!from || !to || !dateStr) continue;
    if (from.toUpperCase() === to.toUpperCase()) {
      fxCache.set(key, new Decimal(1));
      continue;
    }
    try {
      const rate = await getFxRate(from, to, new Date(dateStr));
      fxCache.set(key, rate);
    } catch {
      // Handled per-trade below
    }
  }

  // Build insertable rows
  const rows: {
    portfolioId: string;
    instrumentId: string;
    type: "BUY" | "SELL";
    quantity: string;
    price: string;
    currency: string;
    fxRate: string;
    fees: string;
    date: Date;
    externalRef: string;
  }[] = [];

  for (const { trade, instrumentId, portfolioId, portfolioBaseCurrency } of resolved) {
    const fxKey = `${trade.currency}|${portfolioBaseCurrency}|${trade.date.toISOString().split("T")[0]}`;
    const fxRate = fxCache.get(fxKey);
    if (!fxRate) {
      failed.push({
        symbol: trade.symbol,
        reason: `Could not resolve FX rate for ${trade.currency} → ${portfolioBaseCurrency} on ${fxKey.split("|")[2]}`,
      });
      continue;
    }

    rows.push({
      portfolioId,
      instrumentId,
      type: trade.type,
      quantity: trade.quantity,
      price: trade.price,
      currency: trade.currency,
      fxRate: fxRate.toString(),
      fees: trade.fees,
      date: trade.date,
      externalRef: trade.externalRef,
    });
  }

  if (rows.length === 0) {
    return { inserted: 0, skipped: trades.length - failed.length, failed };
  }

  const result = await db.trade.createMany({
    data: rows,
    skipDuplicates: true,
  });

  const skipped = trades.length - failed.length - result.count;
  return { inserted: result.count, skipped, failed };
}

// ─── Portfolio-based import (CSV upload) ─────────────────────────────────────

/**
 * Import trades directly into a specific portfolio (used by CSV upload).
 */
export async function importTrades(
  trades: ParsedTrade[],
  portfolioId: string,
): Promise<ImportResult> {
  const failed: { symbol: string; reason: string }[] = [];

  if (trades.length === 0) return { inserted: 0, skipped: 0, failed: [] };

  const portfolio = await db.portfolio.findUnique({
    where: { id: portfolioId },
    select: { id: true, baseCurrency: true },
  });
  if (!portfolio) throw new Error("Portfolio not found");

  const { baseCurrency } = portfolio;

  const uniqueSymbols = [...new Set(trades.map((t) => t.symbol))];
  const instrumentMap = new Map<string, { id: string }>();

  for (const symbol of uniqueSymbols) {
    try {
      const inst = await findOrCreateInstrument(symbol);
      instrumentMap.set(symbol, inst);
    } catch (err) {
      failed.push({
        symbol,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const fxCache = new Map<string, Decimal>();
  const uniquePairs = [
    ...new Set(
      trades.map((t) => `${t.currency}|${t.date.toISOString().split("T")[0]}`),
    ),
  ];

  for (const pair of uniquePairs) {
    const [currency, dateStr] = pair.split("|");
    if (!currency || !dateStr) continue;
    if (currency.toUpperCase() === baseCurrency.toUpperCase()) {
      fxCache.set(pair, new Decimal(1));
      continue;
    }
    try {
      const rate = await getFxRate(currency, baseCurrency, new Date(dateStr));
      fxCache.set(pair, rate);
    } catch {
      // Handled per-trade below
    }
  }

  const rows: {
    portfolioId: string;
    instrumentId: string;
    type: "BUY" | "SELL";
    quantity: string;
    price: string;
    currency: string;
    fxRate: string;
    fees: string;
    date: Date;
    externalRef: string;
  }[] = [];

  for (const trade of trades) {
    const instrument = instrumentMap.get(trade.symbol);
    if (!instrument) continue;

    const dateKey = `${trade.currency}|${trade.date.toISOString().split("T")[0]}`;
    const fxRate = fxCache.get(dateKey);
    if (!fxRate) {
      failed.push({
        symbol: trade.symbol,
        reason: `Could not resolve FX rate for ${trade.currency} on ${dateKey}`,
      });
      continue;
    }

    rows.push({
      portfolioId,
      instrumentId: instrument.id,
      type: trade.type,
      quantity: trade.quantity,
      price: trade.price,
      currency: trade.currency,
      fxRate: fxRate.toString(),
      fees: trade.fees,
      date: trade.date,
      externalRef: trade.externalRef,
    });
  }

  if (rows.length === 0) {
    return { inserted: 0, skipped: trades.length - failed.length, failed };
  }

  const result = await db.trade.createMany({
    data: rows,
    skipDuplicates: true,
  });

  const skipped = trades.length - failed.length - result.count;
  return { inserted: result.count, skipped, failed };
}
