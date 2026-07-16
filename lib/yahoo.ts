import YahooFinance from "yahoo-finance2";
import type { ChartResultArray } from "yahoo-finance2/modules/chart";

const yahoo = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

type ChartOptions = Parameters<typeof yahoo.chart>[1];

/**
 * Yahoo chart responses for some ASX symbols (e.g. PMGOLD.AX) omit `meta.currency`
 * and fail yahoo-finance2 schema validation. We coerce OHLC ourselves, so skip it.
 */
async function fetchChart(
  yahooSymbol: string,
  options: ChartOptions,
): Promise<ChartResultArray> {
  const result = await yahoo.chart(yahooSymbol, options, {
    validateResult: false,
  });
  return result as ChartResultArray;
}

export type SearchHit = {
  yahooSymbol: string;
  symbol: string;
  exchange: string;
  name: string;
  quoteType: string;
};

type SearchResponse = {
  quotes?: unknown[];
};

export async function searchSymbols(
  query: string,
  limit = 10,
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Yahoo sometimes changes display fields before yahoo-finance2 updates its
  // schema. Coerce the small quote subset we use instead of failing search.
  const result = (await yahoo.search(
    trimmed,
    {
      quotesCount: limit,
      newsCount: 0,
    },
    { validateResult: false },
  )) as SearchResponse;

  return (result.quotes ?? [])
    .filter(
      (q): q is Record<string, unknown> & { symbol: string } =>
        typeof q === "object" &&
        q !== null &&
        "symbol" in q &&
        typeof q.symbol === "string",
    )
    .map((q) => {
      const yahooSymbol = q.symbol;
      const dotIdx = yahooSymbol.indexOf(".");
      const symbol = dotIdx >= 0 ? yahooSymbol.slice(0, dotIdx) : yahooSymbol;
      const exchange =
        ("exchange" in q && typeof q.exchange === "string"
          ? q.exchange
          : undefined) ??
        ("exchDisp" in q && typeof q.exchDisp === "string"
          ? q.exchDisp
          : undefined) ??
        "";
      const name =
        ("longname" in q && typeof q.longname === "string"
          ? q.longname
          : undefined) ??
        ("shortname" in q && typeof q.shortname === "string"
          ? q.shortname
          : undefined) ??
        yahooSymbol;
      const quoteType =
        ("quoteType" in q && typeof q.quoteType === "string"
          ? q.quoteType
          : undefined) ?? "EQUITY";
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

/** Yahoo exchange codes → ISO currency when the price module omits `currency`. */
const YAHOO_EXCHANGE_CURRENCY: Record<string, string> = {
  ASX: "AUD",
  HKG: "HKD",
  JPX: "JPY",
  KSC: "KRW",
  KOE: "KRW",
  LSE: "GBP",
  TOR: "CAD",
  TSX: "CAD",
};

/** Yahoo symbol suffixes (after the dot) → ISO currency. */
const YAHOO_SYMBOL_SUFFIX_CURRENCY: Record<string, string> = {
  AX: "AUD",
  HK: "HKD",
  T: "JPY",
  TO: "CAD",
  L: "GBP",
  KS: "KRW",
  KQ: "KRW",
};

export function resolveInstrumentCurrency(
  yahooSymbol: string,
  exchange: string,
  rawCurrency: string | undefined | null,
  currencyHint?: string,
): string | null {
  if (rawCurrency) return rawCurrency.trim().toUpperCase();
  const hint = currencyHint?.trim().toUpperCase();
  if (hint) return hint;
  const fromExchange = YAHOO_EXCHANGE_CURRENCY[exchange.trim().toUpperCase()];
  if (fromExchange) return fromExchange;
  const dotIdx = yahooSymbol.lastIndexOf(".");
  if (dotIdx > 0 && dotIdx < yahooSymbol.length - 1) {
    const suffix = yahooSymbol.slice(dotIdx + 1).toUpperCase();
    const fromSuffix = YAHOO_SYMBOL_SUFFIX_CURRENCY[suffix];
    if (fromSuffix) return fromSuffix;
  }
  return null;
}

type QuoteSummaryInstrumentResponse = {
  price?: {
    symbol?: string;
    exchange?: string;
    exchangeName?: string;
    currency?: string | null;
    longName?: string;
    shortName?: string;
    quoteType?: string;
  } | null;
  summaryProfile?: { sector?: string | null; industry?: string | null } | null;
  assetProfile?: { sector?: string | null; industry?: string | null } | null;
};

export async function lookupInstrument(
  yahooSymbol: string,
  options: { currencyHint?: string } = {},
): Promise<InstrumentMeta | null> {
  const sym = yahooSymbol.trim().toUpperCase();
  if (!sym) return null;

  // Some instruments (e.g. ASX gold ETFs) fail yahoo-finance2 schema validation
  // because optional modules are absent or null in Yahoo's response. We coerce
  // the small subset we use ourselves, so skip validation noise here.
  const fetchSummary = () =>
    yahoo.quoteSummary(
      sym,
      {
        modules: ["price", "summaryProfile", "assetProfile"],
      },
      { validateResult: false },
    );

  let summary: QuoteSummaryInstrumentResponse;
  try {
    summary = (await fetchSummary()) as QuoteSummaryInstrumentResponse;
  } catch {
    summary = (await yahoo.quoteSummary(
      sym,
      { modules: ["price"] },
      { validateResult: false },
    )) as QuoteSummaryInstrumentResponse;
  }

  const price = summary.price;
  const profile = summary.summaryProfile ?? summary.assetProfile;
  if (!price?.symbol) return null;

  const exchange = price.exchange ?? price.exchangeName ?? "";
  const currency = resolveInstrumentCurrency(
    price.symbol,
    exchange,
    price.currency,
    options.currencyHint,
  );
  if (!currency) return null;

  const dotIdx = price.symbol.indexOf(".");
  const symbol = dotIdx >= 0 ? price.symbol.slice(0, dotIdx) : price.symbol;

  return {
    yahooSymbol: price.symbol,
    symbol,
    exchange,
    name: price.longName ?? price.shortName ?? price.symbol,
    currency,
    sector: profile && "sector" in profile ? (profile.sector ?? null) : null,
    industry:
      profile && "industry" in profile ? (profile.industry ?? null) : null,
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

export async function fetchQuotes(
  yahooSymbols: string[],
): Promise<QuoteSnapshot[]> {
  const cleaned = Array.from(
    new Set(yahooSymbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  );
  if (cleaned.length === 0) return [];

  const results = await yahoo.quote(cleaned);
  const list = Array.isArray(results) ? results : [results];

  return list
    .filter((q) => q && typeof q.regularMarketPrice === "number")
    .map((q) => ({
      yahooSymbol: q.symbol,
      price: q.regularMarketPrice as number,
      currency: (q.currency ?? "USD").toUpperCase(),
      previousClose:
        typeof q.regularMarketPreviousClose === "number"
          ? q.regularMarketPreviousClose
          : null,
      change:
        typeof q.regularMarketChange === "number"
          ? q.regularMarketChange
          : null,
      changePercent:
        typeof q.regularMarketChangePercent === "number"
          ? q.regularMarketChangePercent
          : null,
      marketState: q.marketState ?? "CLOSED",
      asOf:
        q.regularMarketTime instanceof Date ? q.regularMarketTime : new Date(),
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

export type StockSplitEvent = {
  date: Date;
  numerator: number;
  denominator: number;
  splitRatio: string;
};

function parseSplitRatio(
  value: string,
): { numerator: number; denominator: number } | null {
  const [numeratorRaw, denominatorRaw] = value.split(":");
  const numerator = Number(numeratorRaw);
  const denominator = Number(denominatorRaw);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (numerator <= 0 || denominator <= 0) return null;
  return { numerator, denominator };
}

export const PRICE_CHART_RANGES = ["4h", "1m", "6m", "1y", "5y"] as const;
export type PriceChartRange = (typeof PRICE_CHART_RANGES)[number];

export type PriceChartBar = {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

function dailyBarsFromChart(result: ChartResultArray): DailyBar[] {
  return (result.quotes ?? [])
    .filter(
      (
        q,
      ): q is typeof q & {
        date: Date;
        open: number;
        high: number;
        low: number;
        close: number;
      } =>
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

function stockSplitsFromChart(result: ChartResultArray): StockSplitEvent[] {
  return (result.events?.splits ?? [])
    .filter(
      (
        split,
      ): split is typeof split & {
        date: Date;
        numerator: number;
        denominator: number;
        splitRatio: string;
      } =>
        split.date instanceof Date &&
        typeof split.numerator === "number" &&
        typeof split.denominator === "number" &&
        split.denominator !== 0 &&
        typeof split.splitRatio === "string",
    )
    .map((split) => ({
      date: split.date,
      numerator: split.numerator,
      denominator: split.denominator,
      splitRatio: split.splitRatio,
    }));
}

export async function fetchDailyHistory(
  yahooSymbol: string,
  from: Date,
  to: Date = new Date(),
): Promise<DailyBar[]> {
  const result = await fetchChart(yahooSymbol, {
    period1: from,
    period2: to,
    interval: "1d",
  });

  return dailyBarsFromChart(result);
}

export async function fetchDailyHistoryWithSplits(
  yahooSymbol: string,
  from: Date,
  to: Date = new Date(),
): Promise<{ bars: DailyBar[]; splits: StockSplitEvent[] }> {
  const result = await fetchChart(yahooSymbol, {
    period1: from,
    period2: to,
    interval: "1d",
    events: "split",
  });

  return {
    bars: dailyBarsFromChart(result),
    splits: stockSplitsFromChart(result),
  };
}

export async function fetchStockSplits(
  yahooSymbol: string,
  from: Date,
  to: Date = new Date(),
): Promise<StockSplitEvent[]> {
  const rows = (await yahoo.historical(
    yahooSymbol,
    {
      period1: from,
      period2: to,
      events: "split",
    },
    { validateResult: false },
  )) as unknown[];

  return rows
    .filter(
      (row): row is { date: Date; stockSplits: string } =>
        typeof row === "object" &&
        row !== null &&
        "date" in row &&
        row.date instanceof Date &&
        "stockSplits" in row &&
        typeof row.stockSplits === "string",
    )
    .map((row) => {
      const parsed = parseSplitRatio(row.stockSplits);
      if (!parsed) return null;
      return {
        date: row.date,
        numerator: parsed.numerator,
        denominator: parsed.denominator,
        splitRatio: row.stockSplits,
      };
    })
    .filter((split): split is StockSplitEvent => split !== null);
}

export async function fetchPriceChartHistory(
  yahooSymbol: string,
  range: PriceChartRange,
): Promise<PriceChartBar[]> {
  const to = new Date();
  const from = getPriceChartStart(range, to);
  const result = await fetchChart(yahooSymbol, {
    period1: from,
    period2: to,
    interval: range === "4h" ? "1h" : "1d",
    includePrePost: false,
  });

  const bars = (result.quotes ?? [])
    .filter(
      (
        q,
      ): q is typeof q & {
        date: Date;
        open: number;
        high: number;
        low: number;
        close: number;
      } =>
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
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (range === "4h") return aggregateFourHourBars(bars);

  return bars.map((bar) => ({
    time: bar.date.toISOString().slice(0, 10),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));
}

function getPriceChartStart(range: PriceChartRange, to: Date) {
  const from = new Date(to);
  switch (range) {
    case "4h":
      from.setUTCDate(from.getUTCDate() - 60);
      break;
    case "1m":
      from.setUTCMonth(from.getUTCMonth() - 1);
      break;
    case "6m":
      from.setUTCMonth(from.getUTCMonth() - 6);
      break;
    case "1y":
      from.setUTCFullYear(from.getUTCFullYear() - 1);
      break;
    case "5y":
      from.setUTCFullYear(from.getUTCFullYear() - 5);
      break;
  }
  return from;
}

function aggregateFourHourBars(bars: DailyBar[]): PriceChartBar[] {
  const grouped = new Map<string, DailyBar[]>();
  for (const bar of bars) {
    const bucketStartHour = Math.floor(bar.date.getUTCHours() / 4) * 4;
    const key = `${bar.date.toISOString().slice(0, 10)}T${String(bucketStartHour).padStart(2, "0")}`;
    const group = grouped.get(key);
    if (group) {
      group.push(bar);
    } else {
      grouped.set(key, [bar]);
    }
  }

  return Array.from(grouped.values()).map((group) => {
    const sorted = group.sort((a, b) => a.date.getTime() - b.date.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return {
      time: Math.floor(first.date.getTime() / 1000),
      open: first.open,
      high: Math.max(...sorted.map((bar) => bar.high)),
      low: Math.min(...sorted.map((bar) => bar.low)),
      close: last.close,
      volume: sorted.some((bar) => bar.volume !== null)
        ? sorted.reduce((sum, bar) => sum + (bar.volume ?? 0), 0)
        : null,
    };
  });
}

/**
 * Fetch a single FX rate from Yahoo. Pair is e.g. "USDAUD" — Yahoo uses "USDAUD=X".
 */
export async function fetchFxRate(pair: string): Promise<number | null> {
  const yahooSymbol = `${pair.toUpperCase()}=X`;
  try {
    const q = await yahoo.quote(yahooSymbol);
    if (q && typeof q.regularMarketPrice === "number")
      return q.regularMarketPrice;
  } catch {
    return null;
  }
  return null;
}

export async function fetchFxHistory(
  pair: string,
  from: Date,
  to: Date = new Date(),
) {
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
  targetMeanPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  recommendationMean: number | null;
  recommendationKey: string | null;
  numberOfAnalystOpinions: number | null;
};

type QuoteSummaryFinancialResponse = {
  summaryDetail?: {
    marketCap?: number | null;
    trailingPE?: number | null;
    forwardPE?: number | null;
    dividendYield?: number | null;
    dividendRate?: number | null;
    beta?: number | null;
    fiftyTwoWeekHigh?: number | null;
    fiftyTwoWeekLow?: number | null;
    averageVolume?: number | null;
  } | null;
  defaultKeyStatistics?: {
    forwardPE?: number | null;
    trailingEps?: number | null;
    beta?: number | null;
    bookValue?: number | null;
    priceToBook?: number | null;
  } | null;
  financialData?: {
    profitMargins?: number | null;
    returnOnEquity?: number | null;
    revenueGrowth?: number | null;
    earningsGrowth?: number | null;
    totalRevenue?: number | null;
    freeCashflow?: number | null;
    targetMeanPrice?: number | null;
    targetHighPrice?: number | null;
    targetLowPrice?: number | null;
    recommendationMean?: number | null;
    recommendationKey?: string | null;
    numberOfAnalystOpinions?: number | null;
  } | null;
  summaryProfile?: { longBusinessSummary?: string | null } | null;
};

export async function fetchFinancialSummary(
  yahooSymbol: string,
): Promise<FinancialSummary | null> {
  const sym = yahooSymbol.trim().toUpperCase();
  if (!sym) return null;

  try {
    const summary = (await yahoo.quoteSummary(
      sym,
      {
        modules: [
          "summaryDetail",
          "defaultKeyStatistics",
          "financialData",
          "summaryProfile",
        ],
      },
      { validateResult: false },
    )) as QuoteSummaryFinancialResponse;

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
      targetMeanPrice: fin?.targetMeanPrice ?? null,
      targetHighPrice: fin?.targetHighPrice ?? null,
      targetLowPrice: fin?.targetLowPrice ?? null,
      recommendationMean: fin?.recommendationMean ?? null,
      recommendationKey: fin?.recommendationKey ?? null,
      numberOfAnalystOpinions: fin?.numberOfAnalystOpinions ?? null,
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

export async function fetchNews(
  yahooSymbol: string,
  count = 8,
): Promise<NewsItem[]> {
  try {
    const result = await yahoo.search(yahooSymbol, {
      quotesCount: 0,
      newsCount: count,
    });
    return result.news.map((n) => ({
      uuid: n.uuid,
      title: n.title,
      link: n.link,
      publisher: n.publisher ?? "",
      publishedAt:
        n.providerPublishTime instanceof Date
          ? n.providerPublishTime
          : new Date(n.providerPublishTime),
      thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
    }));
  } catch {
    return [];
  }
}
