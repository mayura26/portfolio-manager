import { db } from "@/lib/db";
import { fetchDailyHistory, lookupInstrument } from "@/lib/yahoo";

const BACKFILL_DAYS = 30;

/**
 * Resolve an instrument by its Yahoo symbol. If we haven't seen it before,
 * fetch metadata from Yahoo, persist it, and seed a short price history
 * window so latest-price lookups have something to read immediately.
 */
export async function findOrCreateInstrument(yahooSymbol: string) {
  const sym = yahooSymbol.trim().toUpperCase();
  if (!sym) throw new Error("Symbol is required");

  const existing = await db.instrument.findUnique({
    where: { yahooSymbol: sym },
  });
  if (existing) return existing;

  const meta = await lookupInstrument(sym);
  if (!meta)
    throw new Error(`Could not find instrument ${sym} on Yahoo Finance`);

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
