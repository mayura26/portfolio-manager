import "server-only";
import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

export type SearchHit = {
  yahooSymbol: string;
  symbol: string;
  exchange: string;
  name: string;
  quoteType: string;
};

export async function searchSymbols(query: string, limit = 10): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const result = await yahoo.search(trimmed, { quotesCount: limit, newsCount: 0 });

  return result.quotes
    .filter((q): q is typeof q & { symbol: string } => "symbol" in q && typeof q.symbol === "string")
    .map((q) => {
      const yahooSymbol = q.symbol;
      const dotIdx = yahooSymbol.indexOf(".");
      const symbol = dotIdx >= 0 ? yahooSymbol.slice(0, dotIdx) : yahooSymbol;
      const exchange =
        ("exchange" in q && typeof q.exchange === "string" ? q.exchange : undefined) ??
        ("exchDisp" in q && typeof q.exchDisp === "string" ? q.exchDisp : undefined) ??
        "";
      const name =
        ("longname" in q && typeof q.longname === "string" ? q.longname : undefined) ??
        ("shortname" in q && typeof q.shortname === "string" ? q.shortname : undefined) ??
        yahooSymbol;
      const quoteType =
        ("quoteType" in q && typeof q.quoteType === "string" ? q.quoteType : undefined) ?? "EQUITY";
      return { yahooSymbol, symbol, exchange, name, quoteType };
    });
}

export type InstrumentMeta = {
  yahooSymbol: string;
  symbol: string;
  exchange: string;
  name: string;
  currency: string;
  sector: string | null;
  industry: string | null;
  instrumentType: string;
};

export async function lookupInstrument(yahooSymbol: string): Promise<InstrumentMeta | null> {
  const sym = yahooSymbol.trim().toUpperCase();
  if (!sym) return null;

  const summary = await yahoo.quoteSummary(sym, {
    modules: ["price", "summaryProfile", "assetProfile"],
  });

  const price = summary.price;
  const profile = summary.summaryProfile ?? summary.assetProfile;
  if (!price?.symbol || !price.currency) return null;

  const exchange = price.exchange ?? price.exchangeName ?? "";
  const dotIdx = price.symbol.indexOf(".");
  const symbol = dotIdx >= 0 ? price.symbol.slice(0, dotIdx) : price.symbol;

  return {
    yahooSymbol: price.symbol,
    symbol,
    exchange,
    name: price.longName ?? price.shortName ?? price.symbol,
    currency: price.currency.toUpperCase(),
    sector: profile && "sector" in profile ? (profile.sector ?? null) : null,
    industry: profile && "industry" in profile ? (profile.industry ?? null) : null,
    instrumentType: price.quoteType ?? "EQUITY",
  };
}

export type QuoteSnapshot = {
  yahooSymbol: string;
  price: number;
  currency: string;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  marketState: string;
  asOf: Date;
};

export async function fetchQuotes(yahooSymbols: string[]): Promise<QuoteSnapshot[]> {
  const cleaned = Array.from(new Set(yahooSymbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  if (cleaned.length === 0) return [];

  const results = await yahoo.quote(cleaned);
  const list = Array.isArray(results) ? results : [results];

  return list
    .filter((q) => q && typeof q.regularMarketPrice === "number")
    .map((q) => ({
      yahooSymbol: q.symbol,
      price: q.regularMarketPrice as number,
      currency: (q.currency ?? "USD").toUpperCase(),
      previousClose: typeof q.regularMarketPreviousClose === "number" ? q.regularMarketPreviousClose : null,
      change: typeof q.regularMarketChange === "number" ? q.regularMarketChange : null,
      changePercent:
        typeof q.regularMarketChangePercent === "number" ? q.regularMarketChangePercent : null,
      marketState: q.marketState ?? "CLOSED",
      asOf: q.regularMarketTime instanceof Date ? q.regularMarketTime : new Date(),
    }));
}

export type DailyBar = {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export async function fetchDailyHistory(
  yahooSymbol: string,
  from: Date,
  to: Date = new Date(),
): Promise<DailyBar[]> {
  const result = await yahoo.chart(yahooSymbol, {
    period1: from,
    period2: to,
    interval: "1d",
  });

  return (result.quotes ?? [])
    .filter(
      (q): q is typeof q & { date: Date; open: number; high: number; low: number; close: number } =>
        q.date instanceof Date &&
        typeof q.open === "number" &&
        typeof q.high === "number" &&
        typeof q.low === "number" &&
        typeof q.close === "number",
    )
    .map((q) => ({
      date: q.date,
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: typeof q.volume === "number" ? q.volume : null,
    }));
}

/**
 * Fetch a single FX rate from Yahoo. Pair is e.g. "USDAUD" — Yahoo uses "USDAUD=X".
 */
export async function fetchFxRate(pair: string): Promise<number | null> {
  const yahooSymbol = `${pair.toUpperCase()}=X`;
  try {
    const q = await yahoo.quote(yahooSymbol);
    if (q && typeof q.regularMarketPrice === "number") return q.regularMarketPrice;
  } catch {
    return null;
  }
  return null;
}

export async function fetchFxHistory(pair: string, from: Date, to: Date = new Date()) {
  return fetchDailyHistory(`${pair.toUpperCase()}=X`, from, to);
}
