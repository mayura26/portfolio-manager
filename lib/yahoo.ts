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

export type FinancialSummary = {
  yahooSymbol: string;
  marketCap: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  eps: number | null;
  dividendYield: number | null;
  dividendRate: number | null;
  beta: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
  averageVolume: number | null;
  bookValue: number | null;
  priceToBook: number | null;
  profitMargin: number | null;
  returnOnEquity: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  totalRevenue: number | null;
  freeCashflow: number | null;
  longBusinessSummary: string | null;
};

export async function fetchFinancialSummary(yahooSymbol: string): Promise<FinancialSummary | null> {
  const sym = yahooSymbol.trim().toUpperCase();
  if (!sym) return null;

  try {
    const summary = await yahoo.quoteSummary(sym, {
      modules: ["summaryDetail", "defaultKeyStatistics", "financialData", "summaryProfile"],
    });

    const detail = summary.summaryDetail;
    const stats = summary.defaultKeyStatistics;
    const fin = summary.financialData;
    const profile = summary.summaryProfile;

    return {
      yahooSymbol: sym,
      marketCap: detail?.marketCap ?? null,
      peRatio: detail?.trailingPE ?? null,
      forwardPE: detail?.forwardPE ?? stats?.forwardPE ?? null,
      eps: stats?.trailingEps ?? null,
      dividendYield: detail?.dividendYield ?? null,
      dividendRate: detail?.dividendRate ?? null,
      beta: detail?.beta ?? stats?.beta ?? null,
      weekHigh52: detail?.fiftyTwoWeekHigh ?? null,
      weekLow52: detail?.fiftyTwoWeekLow ?? null,
      averageVolume: detail?.averageVolume ?? null,
      bookValue: stats?.bookValue ?? null,
      priceToBook: stats?.priceToBook ?? null,
      profitMargin: fin?.profitMargins ?? null,
      returnOnEquity: fin?.returnOnEquity ?? null,
      revenueGrowth: fin?.revenueGrowth ?? null,
      earningsGrowth: fin?.earningsGrowth ?? null,
      totalRevenue: fin?.totalRevenue ?? null,
      freeCashflow: fin?.freeCashflow ?? null,
      longBusinessSummary: profile?.longBusinessSummary ?? null,
    };
  } catch {
    return null;
  }
}

export type NewsItem = {
  uuid: string;
  title: string;
  link: string;
  publisher: string;
  publishedAt: Date;
  thumbnail: string | null;
};

export async function fetchNews(yahooSymbol: string, count = 8): Promise<NewsItem[]> {
  try {
    const result = await yahoo.search(yahooSymbol, { quotesCount: 0, newsCount: count });
    return result.news.map((n) => ({
      uuid: n.uuid,
      title: n.title,
      link: n.link,
      publisher: n.publisher ?? "",
      publishedAt: n.providerPublishTime instanceof Date ? n.providerPublishTime : new Date(n.providerPublishTime),
      thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
    }));
  } catch {
    return [];
  }
}
