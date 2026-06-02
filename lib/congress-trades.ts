import { XMLParser } from "fast-xml-parser";
import { db } from "@/lib/db";
import { findOrCreateInstrument } from "@/lib/instruments";

// ─── Types ────────────────────────────────────────────────────

type FilingMeta = {
  docId: string;
  firstName: string;
  lastName: string;
  stateDist: string;
  filingDate: Date;
  year: number;
};

type RawTransaction = {
  ticker: string;
  assetName: string | null;
  transaction: string;
  transactionDate: Date;
  rangeRaw: string | null;
};

type HouseSearchRow = {
  StateDst?: string;
  Last?: string;
  First?: string;
  Filing_Date?: string;
  DocID?: string;
};

type HouseSearchResponse = {
  pagerInfo?: {
    pageNumber: number;
    totalPages: number;
  };
  filingData?: HouseSearchRow[];
};

// ─── Helpers ──────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

export function parseAmountRange(raw: string | null | undefined): {
  low: number | null;
  high: number | null;
  mid: number | null;
} {
  if (!raw) return { low: null, high: null, mid: null };

  const overMatch = raw.match(/over\s+\$([0-9,]+)/i);
  if (overMatch) {
    const low = Number(overMatch[1].replace(/,/g, ""));
    return { low, high: null, mid: null };
  }

  const clean = raw.replace(/\$/g, "").replace(/,/g, "").trim();
  const parts = clean.split(/\s*-\s*/);

  if (parts.length === 2) {
    const low = Number(parts[0].trim()) || null;
    const high = Number(parts[1].trim()) || null;
    const mid =
      low !== null && high !== null ? Math.round((low + high) / 2) : null;
    return { low, high, mid };
  }

  if (parts.length === 1) {
    const v = Number(parts[0].trim()) || null;
    return { low: v, high: v, mid: v };
  }

  return { low: null, high: null, mid: null };
}

function parseTransactionType(raw: string): string {
  switch (raw?.trim().toUpperCase()) {
    case "P":
    case "PURCHASE":
      return "Purchase";
    case "S":
    case "SALE":
      return "Sale";
    case "S (PARTIAL)":
    case "SALE (PARTIAL)":
      return "Sale (Partial)";
    case "E":
    case "EXCHANGE":
      return "Exchange";
    default:
      return raw || "Unknown";
  }
}

function parseMDY(raw: string | undefined): Date | null {
  if (!raw) return null;
  const parts = raw.trim().split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(date.getTime())) return date;
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

// ─── House disclosure API ─────────────────────────────────────

async function fetchFilingIndex(
  fromDate: Date,
  toDate: Date,
): Promise<FilingMeta[]> {
  const results: FilingMeta[] = [];
  const fromYear = fromDate.getFullYear();
  const toYear = toDate.getFullYear();

  for (let year = fromYear; year <= toYear; year++) {
    const yearFrom = year === fromYear ? fromDate : new Date(year, 0, 1);
    const yearTo = year === toYear ? toDate : new Date(year, 11, 31);

    const fmt = (d: Date) =>
      `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const params = new URLSearchParams({
        LastName: "",
        FirstName: "",
        FilingYear: String(year),
        State: "",
        District: "",
        ReportType: "P",
        FileType: "P",
        DateRange: "custom",
        FromDate: fmt(yearFrom),
        ToDate: fmt(yearTo),
        page: String(page),
        pageSize: "100",
      });

      const resp = await fetch(
        `https://disclosures.house.gov/api/FilingSearch?${params}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "PortfolioManager/1.0",
          },
        },
      );

      if (!resp.ok) break;

      const data = (await resp.json()) as HouseSearchResponse;
      totalPages = data.pagerInfo?.totalPages ?? 1;

      for (const row of data.filingData ?? []) {
        if (!row.DocID || !row.Filing_Date) continue;
        const filingDate = parseMDY(row.Filing_Date);
        if (!filingDate) continue;

        results.push({
          docId: row.DocID,
          firstName: row.First ?? "",
          lastName: row.Last ?? "",
          stateDist: row.StateDst ?? "",
          filingDate,
          year: filingDate.getFullYear(),
        });
      }

      page++;
      if (page <= totalPages) await sleep(500);
    }
  }

  return results;
}

async function fetchFilingTransactions(
  filing: FilingMeta,
): Promise<RawTransaction[]> {
  const url = `https://disclosures.house.gov/data/${filing.year}/${filing.docId}.xml`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { "User-Agent": "PortfolioManager/1.0" },
    });
  } catch {
    return [];
  }

  if (!resp.ok) return [];

  const xml = await resp.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: true,
    trimValues: true,
    isArray: (tagName) => tagName === "Transaction",
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml);
  } catch {
    return [];
  }

  // Root element name varies across disclosure years
  const root =
    (parsed.FinancialDisclosure as Record<string, unknown>) ??
    (parsed.PeriodicTransactionReport as Record<string, unknown>) ??
    (parsed as Record<string, unknown>);

  const transactionsNode = root?.Transactions as
    | Record<string, unknown>
    | undefined;
  const txList = transactionsNode?.Transaction;

  if (!Array.isArray(txList)) return [];

  const results: RawTransaction[] = [];

  for (const tx of txList as Record<string, unknown>[]) {
    const asset = (tx.Asset as Record<string, unknown>) ?? {};
    const rawTicker = String(
      asset.TICKER ?? asset.Ticker ?? asset.ticker ?? "",
    ).trim();

    if (!rawTicker || rawTicker === "--" || rawTicker.length > 10) continue;
    const ticker = rawTicker.toUpperCase();

    const assetName =
      String(asset.Name ?? asset.AssetName ?? "").trim() || null;

    const txDateRaw = String(tx.TransactionDate ?? tx.Date ?? "").trim();
    const transactionDate = parseMDY(txDateRaw);
    if (!transactionDate) continue;

    const txType = parseTransactionType(
      String(tx.Type ?? tx.TransactionType ?? "").trim(),
    );
    const rangeRaw =
      String(tx.Amount ?? tx.AmountRange ?? "").trim() || null;

    results.push({ ticker, assetName, transaction: txType, transactionDate, rangeRaw });
  }

  return results;
}

// ─── Sync engine ──────────────────────────────────────────────

export type CongressSyncResult = {
  ok: boolean;
  inserted: number;
  skipped: number;
  enriched: number;
  filingCount: number;
  error?: string;
};

export async function runCongressSync(
  _trigger: "cron" | "manual",
): Promise<CongressSyncResult> {
  const lastRun = await db.cronJobRun.findFirst({
    where: { job: "congress-trades", ok: true },
    orderBy: { startedAt: "desc" },
  });

  const now = new Date();
  const fromDate = lastRun
    ? lastRun.startedAt
    : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const filings = await fetchFilingIndex(fromDate, now);

  if (filings.length === 0) {
    return { ok: true, inserted: 0, skipped: 0, enriched: 0, filingCount: 0 };
  }

  // Fetch transactions — 5 concurrent XML downloads
  type FilingResult = { filing: FilingMeta; txs: RawTransaction[] };
  const filingsWithTxs: FilingResult[] = [];

  for (let i = 0; i < filings.length; i += 5) {
    const batch = filings.slice(i, i + 5);
    const settled = await Promise.allSettled(
      batch.map(async (f) => ({ filing: f, txs: await fetchFilingTransactions(f) })),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") filingsWithTxs.push(r.value);
    }
    if (i + 5 < filings.length) await sleep(200);
  }

  // Enrich distinct tickers with Yahoo Finance
  const allTickers = new Set<string>();
  for (const { txs } of filingsWithTxs) {
    for (const tx of txs) allTickers.add(tx.ticker);
  }

  const enrichmentCache = new Map<
    string,
    { instrumentId: string; sector: string | null; industry: string | null } | null
  >();

  const tickerArray = Array.from(allTickers);
  let enriched = 0;

  for (let i = 0; i < tickerArray.length; i += 20) {
    const batch = tickerArray.slice(i, i + 20);
    await Promise.allSettled(
      batch.map(async (ticker) => {
        try {
          const inst = await findOrCreateInstrument(ticker);
          enrichmentCache.set(ticker, {
            instrumentId: inst.id,
            sector: inst.sector,
            industry: inst.industry,
          });
          enriched++;
        } catch {
          enrichmentCache.set(ticker, null);
        }
      }),
    );
  }

  // Build insert rows
  const rows: {
    politician: string;
    stateDist: string | null;
    chamber: string;
    ticker: string;
    assetName: string | null;
    transaction: string;
    transactionDate: Date;
    reportDate: Date | null;
    rangeRaw: string | null;
    amountLow: number | null;
    amountHigh: number | null;
    amountMid: number | null;
    instrumentId: string | null;
    sector: string | null;
    industry: string | null;
    externalKey: string;
  }[] = [];

  for (const { filing, txs } of filingsWithTxs) {
    const politician = `${filing.firstName} ${filing.lastName}`.trim();

    for (const tx of txs) {
      const amounts = parseAmountRange(tx.rangeRaw);
      const enrichment = enrichmentCache.get(tx.ticker) ?? null;

      const externalKey = [
        filing.stateDist,
        filing.docId,
        tx.transactionDate.toISOString().slice(0, 10),
        tx.ticker,
        tx.transaction,
      ].join("|");

      rows.push({
        politician,
        stateDist: filing.stateDist || null,
        chamber: "House",
        ticker: tx.ticker,
        assetName: tx.assetName,
        transaction: tx.transaction,
        transactionDate: tx.transactionDate,
        reportDate: filing.filingDate,
        rangeRaw: tx.rangeRaw,
        amountLow: amounts.low,
        amountHigh: amounts.high,
        amountMid: amounts.mid,
        instrumentId: enrichment?.instrumentId ?? null,
        sector: enrichment?.sector ?? null,
        industry: enrichment?.industry ?? null,
        externalKey,
      });
    }
  }

  if (rows.length === 0) {
    return { ok: true, inserted: 0, skipped: 0, enriched, filingCount: filings.length };
  }

  const { count } = await db.congressTrade.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return {
    ok: true,
    inserted: count,
    skipped: rows.length - count,
    enriched,
    filingCount: filings.length,
  };
}

// ─── Aggregation queries ──────────────────────────────────────

export type TradeCluster = {
  ticker: string;
  sector: string | null;
  buyCount: number;
  sellCount: number;
  totalTrades: number;
  politicians: string[];
  latestDate: Date;
};

export async function getTopClusters(opts: {
  since: Date;
  sector?: string;
  limit?: number;
}): Promise<TradeCluster[]> {
  const { since, sector, limit = 20 } = opts;
  const baseWhere = {
    transactionDate: { gte: since },
    ...(sector ? { sector } : {}),
  };

  const [buys, sells] = await Promise.all([
    db.congressTrade.groupBy({
      by: ["ticker"],
      where: { ...baseWhere, transaction: "Purchase" },
      _count: { _all: true },
      _max: { transactionDate: true },
    }),
    db.congressTrade.groupBy({
      by: ["ticker"],
      where: { ...baseWhere, transaction: { in: ["Sale", "Sale (Partial)"] } },
      _count: { _all: true },
      _max: { transactionDate: true },
    }),
  ]);

  const buyMap = new Map(
    buys.map((b) => [b.ticker, { count: b._count._all, latestDate: b._max.transactionDate! }]),
  );
  const sellMap = new Map(
    sells.map((s) => [s.ticker, { count: s._count._all, latestDate: s._max.transactionDate! }]),
  );

  const allTickers = new Set([...buyMap.keys(), ...sellMap.keys()]);
  const clusters: Omit<TradeCluster, "politicians" | "sector">[] = [];

  for (const ticker of allTickers) {
    const b = buyMap.get(ticker);
    const s = sellMap.get(ticker);
    const buyCount = b?.count ?? 0;
    const sellCount = s?.count ?? 0;
    const latestDate =
      b?.latestDate && s?.latestDate
        ? b.latestDate > s.latestDate ? b.latestDate : s.latestDate
        : b?.latestDate ?? s?.latestDate ?? new Date();
    clusters.push({ ticker, buyCount, sellCount, totalTrades: buyCount + sellCount, latestDate });
  }

  clusters.sort((a, b) => b.totalTrades - a.totalTrades);
  const top = clusters.slice(0, limit);

  if (top.length === 0) return [];

  const topTickers = top.map((c) => c.ticker);

  // Fetch sector and politicians for top tickers in one batch
  const [sectorRows, politicianRows] = await Promise.all([
    db.congressTrade.findMany({
      where: { ticker: { in: topTickers }, sector: { not: null } },
      select: { ticker: true, sector: true },
      distinct: ["ticker"],
    }),
    db.congressTrade.findMany({
      where: { ticker: { in: topTickers }, transactionDate: { gte: since } },
      select: { ticker: true, politician: true },
      distinct: ["ticker", "politician"],
    }),
  ]);

  const sectorMap = new Map(sectorRows.map((r) => [r.ticker, r.sector]));
  const polMap = new Map<string, string[]>();
  for (const r of politicianRows) {
    if (!polMap.has(r.ticker)) polMap.set(r.ticker, []);
    polMap.get(r.ticker)!.push(r.politician);
  }

  return top.map((c) => ({
    ...c,
    sector: sectorMap.get(c.ticker) ?? null,
    politicians: polMap.get(c.ticker) ?? [],
  }));
}

export type SectorBreakdown = {
  sector: string;
  buyCount: number;
  sellCount: number;
};

export async function getSectorBreakdown(since: Date): Promise<SectorBreakdown[]> {
  const rows = await db.congressTrade.groupBy({
    by: ["sector", "transaction"],
    where: { transactionDate: { gte: since }, sector: { not: null } },
    _count: { _all: true },
  });

  const map = new Map<string, SectorBreakdown>();
  for (const row of rows) {
    if (!row.sector) continue;
    if (!map.has(row.sector)) map.set(row.sector, { sector: row.sector, buyCount: 0, sellCount: 0 });
    const entry = map.get(row.sector)!;
    if (row.transaction === "Purchase") entry.buyCount += row._count._all;
    else entry.sellCount += row._count._all;
  }

  return Array.from(map.values()).sort(
    (a, b) => b.buyCount + b.sellCount - (a.buyCount + a.sellCount),
  );
}

export type CongressTradeRow = {
  id: string;
  politician: string;
  stateDist: string | null;
  chamber: string;
  ticker: string;
  assetName: string | null;
  transaction: string;
  transactionDate: Date;
  reportDate: Date | null;
  rangeRaw: string | null;
  sector: string | null;
  amountMid: number | null;
};

export async function getFilteredTrades(opts: {
  since: Date;
  sector?: string;
  ticker?: string;
  transaction?: string;
  page: number;
  pageSize?: number;
}): Promise<{ trades: CongressTradeRow[]; total: number }> {
  const { since, sector, ticker, transaction, page, pageSize = 50 } = opts;

  const where = {
    transactionDate: { gte: since },
    ...(sector ? { sector } : {}),
    ...(ticker ? { ticker } : {}),
    ...(transaction ? { transaction } : {}),
  };

  const [trades, total] = await Promise.all([
    db.congressTrade.findMany({
      where,
      orderBy: { transactionDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        politician: true,
        stateDist: true,
        chamber: true,
        ticker: true,
        assetName: true,
        transaction: true,
        transactionDate: true,
        reportDate: true,
        rangeRaw: true,
        sector: true,
        amountMid: true,
      },
    }),
    db.congressTrade.count({ where }),
  ]);

  return { trades, total };
}

export async function getSummaryStats(since: Date) {
  const [totalTrades, tickerGroups, politicianGroups, lastRun] = await Promise.all([
    db.congressTrade.count({ where: { transactionDate: { gte: since } } }),
    db.congressTrade.groupBy({
      by: ["ticker"],
      where: { transactionDate: { gte: since } },
      _count: { _all: true },
    }),
    db.congressTrade.groupBy({
      by: ["politician"],
      where: { transactionDate: { gte: since } },
      _count: { _all: true },
    }),
    db.cronJobRun.findFirst({
      where: { job: "congress-trades" },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  return {
    totalTrades,
    uniqueTickers: tickerGroups.length,
    uniquePoliticians: politicianGroups.length,
    lastSyncAt: lastRun?.finishedAt ?? null,
    lastSyncOk: lastRun?.ok ?? null,
  };
}

export async function getDistinctSectors(): Promise<string[]> {
  const rows = await db.congressTrade.findMany({
    where: { sector: { not: null } },
    select: { sector: true },
    distinct: ["sector"],
    orderBy: { sector: "asc" },
  });
  return rows.map((r) => r.sector!);
}
