import { db } from "@/lib/db";
import {
  type SymbolCandidateOptions,
  shouldPreferMarketSpecificInstrument,
  yahooSymbolCandidatesForRawSymbol,
} from "@/lib/instrument-symbols";
import { fetchDailyHistory, lookupInstrument } from "@/lib/yahoo";

const BACKFILL_DAYS = 30;

export {
  shouldPreferMarketSpecificInstrument,
  yahooSymbolCandidatesForRawSymbol,
};

/** Normalize `[symbol]` route param (decode + trim + upper-case). */
export function normalizeStockUrlSymbol(raw: string): string {
  return decodeURIComponent(raw).trim().toUpperCase();
}

/**
 * Yahoo symbols to try for `/stocks/[symbol]` when the path omits the
 * exchange suffix (e.g. `000660` -> `000660.KS` on Yahoo / in our DB).
 */
export function yahooSymbolCandidatesForUrlPath(key: string): string[] {
  return yahooSymbolCandidatesForRawSymbol(key);
}

/**
 * Map a `/stocks/[symbol]` path segment to the canonical `Instrument.yahooSymbol`
 * stored in the DB (e.g. `000660` -> `000660.KS`). Returns null if unknown.
 */
export async function resolveInstrumentYahooSymbolFromUrlPath(
  rawSegment: string,
): Promise<string | null> {
  const key = normalizeStockUrlSymbol(rawSegment);
  if (!key) return null;

  for (const yahooSymbol of yahooSymbolCandidatesForUrlPath(key)) {
    const row = await db.instrument.findUnique({
      where: { yahooSymbol },
      select: { yahooSymbol: true },
    });
    if (row) return row.yahooSymbol;
  }

  const byLocalSymbol = await db.instrument.findMany({
    where: { symbol: key },
    select: { yahooSymbol: true },
    take: 2,
  });
  if (byLocalSymbol.length === 1) return byLocalSymbol[0].yahooSymbol;
  return null;
}

/**
 * Resolve an instrument by its Yahoo symbol. If we haven't seen it before,
 * fetch metadata from Yahoo, persist it, and seed a short price history
 * window so latest-price lookups have something to read immediately.
 */
export async function findOrCreateInstrument(
  yahooSymbol: string,
  options: SymbolCandidateOptions = {},
) {
  const sym = yahooSymbol.trim().toUpperCase();
  if (!sym) throw new Error("Symbol is required");

  const candidates = yahooSymbolCandidatesForRawSymbol(sym, options);
  const preferMarketSpecific = shouldPreferMarketSpecificInstrument(
    sym,
    options,
  );
  const existingCandidateChecks = preferMarketSpecific
    ? candidates.filter((candidate) => candidate !== sym)
    : candidates;

  for (const candidate of existingCandidateChecks) {
    const existing = await db.instrument.findUnique({
      where: { yahooSymbol: candidate },
    });
    if (existing) return existing;
  }

  if (!preferMarketSpecific) {
    const existingByLocalSymbol = await db.instrument.findMany({
      where: { symbol: sym },
      take: 2,
    });
    if (existingByLocalSymbol.length === 1) return existingByLocalSymbol[0];
  }

  let meta: Awaited<ReturnType<typeof lookupInstrument>> = null;
  for (const candidate of candidates) {
    try {
      if (preferMarketSpecific && candidate === sym) {
        const fallbackExisting = await db.instrument.findUnique({
          where: { yahooSymbol: candidate },
        });
        if (fallbackExisting) return fallbackExisting;
      }
      meta = await lookupInstrument(candidate, {
        currencyHint: options.currencyHint,
      });
      if (meta) break;
    } catch {
      // Try the next exchange-specific candidate.
    }
  }
  if (!meta) {
    const suffixHint =
      candidates.length > 1 ? ` (tried ${candidates.join(", ")})` : "";
    throw new Error(
      `Could not find instrument ${sym} on Yahoo Finance${suffixHint}`,
    );
  }

  const created = await db.instrument.create({
    data: {
      symbol: meta.symbol,
      exchange: meta.exchange,
      yahooSymbol: meta.yahooSymbol,
      name: meta.name,
      currency: meta.currency,
      sector: meta.sector,
      industry: meta.industry,
      instrumentType: meta.instrumentType,
    },
  });

  // Seed price history (best-effort; ignored on failure).
  try {
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - BACKFILL_DAYS);
    const bars = await fetchDailyHistory(meta.yahooSymbol, from);
    if (bars.length > 0) {
      await db.priceHistory.createMany({
        data: bars.map((b) => ({
          instrumentId: created.id,
          date: b.date,
          open: b.open.toString(),
          high: b.high.toString(),
          low: b.low.toString(),
          close: b.close.toString(),
          volume: b.volume === null ? null : BigInt(Math.trunc(b.volume)),
        })),
        skipDuplicates: true,
      });
    }
  } catch {
    // Non-fatal: cron will fill prices later.
  }

  return created;
}
