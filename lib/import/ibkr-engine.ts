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

  // Pre-fetch all unique FX rates (currency + date pairs)
  const fxCache = new Map<string, Decimal>();
  const uniquePairs = [
    ...new Set(
      trades.map((t) => `${t.currency}|${t.date.toISOString().split("T")[0]}`),
    ),
  ];

  for (const pair of uniquePairs) {
    const [currency, dateStr] = pair.split("|");
    if (!currency || currency.toUpperCase() === baseCurrency.toUpperCase()) {
      fxCache.set(pair, new Decimal(1));
      continue;
    }
    try {
      const rate = await getFxRate(currency, baseCurrency, new Date(dateStr));
      fxCache.set(pair, rate);
    } catch {
      // Will use null rate — handled per-trade below
    }
  }

  // Build insertable rows
  type TradeRow = {
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
  };

  const rows: TradeRow[] = [];

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
