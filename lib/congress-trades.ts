import { XMLParser } from "fast-xml-parser";
import pdfParse from "pdf-parse";
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
    // Open-ended band (e.g. "Over $250,000") has no upper bound; use the floor
    // as a conservative midpoint so these large trades still carry dollar volume.
    return { low, high: null, mid: low };
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

export type TickerEnrichment = {
  instrumentId: string;
  sector: string | null;
  industry: string | null;
};

/**
 * Resolve a set of tickers to instruments (creating + enriching via Yahoo as
 * needed), 20 at a time. Shared by every trade source (House/Senate/OGE) so the
 * sector/industry/instrument linkage is consistent. Failures cache as null
 * rather than throwing, so one bad ticker never aborts a sync.
 */
export async function enrichTickers(
  tickers: Iterable<string>,
): Promise<{ cache: Map<string, TickerEnrichment | null>; enriched: number }> {
  const cache = new Map<string, TickerEnrichment | null>();
  const arr = Array.from(new Set(tickers));
  let enriched = 0;

  for (let i = 0; i < arr.length; i += 20) {
    const batch = arr.slice(i, i + 20);
    await Promise.allSettled(
      batch.map(async (ticker) => {
        try {
          const inst = await findOrCreateInstrument(ticker);
          cache.set(ticker, {
            instrumentId: inst.id,
            sector: inst.sector,
            industry: inst.industry,
          });
          enriched++;
        } catch {
          cache.set(ticker, null);
        }
      }),
    );
  }

  return { cache, enriched };
}

function parseTransactionType(raw: string): string {
  const t = raw?.trim().toUpperCase();
  if (t === "P" || t === "PURCHASE") return "Purchase";
  if (t === "S" || t === "SALE") return "Sale";
  if (t === "S (PARTIAL)" || t === "SALE (PARTIAL)") return "Sale (Partial)";
  if (t === "E" || t === "EXCHANGE") return "Exchange";
  return raw || "Unknown";
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

// ─── FD ZIP index (official House bulk data) ──────────────────

type FdMember = {
  Last?: string;
  First?: string;
  Prefix?: string;
  FilingType?: string;
  StateDst?: string;
  Year?: string | number;
  FilingDate?: string;
  DocID?: string | number;
};

async function fetchFdIndex(year: number): Promise<FdMember[]> {
  const url = `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.zip`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { "User-Agent": "PortfolioManager/1.0 (investment research)" },
    });
  } catch {
    return [];
  }
  if (!resp.ok) return [];

  const zipBuf = Buffer.from(await resp.arrayBuffer());

  // Extract the XML file from the ZIP using manual ZIP parsing
  const xmlContent = extractFirstXmlFromZip(zipBuf);
  if (!xmlContent) return [];

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: true,
    trimValues: true,
    isArray: (tag) => tag === "Member",
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xmlContent);
  } catch {
    return [];
  }

  const root =
    (parsed.FinancialDisclosure as Record<string, unknown>) ?? parsed;
  const members = root?.Member;
  if (!Array.isArray(members)) return [];
  return members as FdMember[];
}

// Minimal ZIP reader — finds the first .xml file entry and returns its content
function extractFirstXmlFromZip(buf: Buffer): string | null {
  // ZIP local file header signature: 0x04034b50
  let offset = 0;
  while (offset < buf.length - 30) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;

    const compMethod = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const fnLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const fileName = buf
      .slice(offset + 30, offset + 30 + fnLen)
      .toString("utf8");

    const dataOffset = offset + 30 + fnLen + extraLen;

    if (fileName.toLowerCase().endsWith(".xml")) {
      if (compMethod === 0) {
        // Stored (no compression)
        return buf.slice(dataOffset, dataOffset + uncompSize).toString("utf8");
      } else if (compMethod === 8) {
        // Deflate
        const zlib = require("node:zlib");
        const compressed = buf.slice(dataOffset, dataOffset + compSize);
        try {
          return zlib.inflateRawSync(compressed).toString("utf8");
        } catch {
          return null;
        }
      }
    }

    offset = dataOffset + compSize;
  }
  return null;
}

export async function fetchFilingIndex(
  fromDate: Date,
  toDate: Date,
): Promise<FilingMeta[]> {
  const results: FilingMeta[] = [];
  const fromYear = fromDate.getFullYear();
  const toYear = toDate.getFullYear();

  for (let year = fromYear; year <= toYear; year++) {
    const members = await fetchFdIndex(year);
    for (const m of members) {
      if (String(m.FilingType).trim().toUpperCase() !== "P") continue;
      if (!m.DocID || !m.FilingDate) continue;

      const filingDate = parseMDY(String(m.FilingDate));
      if (!filingDate) continue;
      if (filingDate < fromDate || filingDate > toDate) continue;

      results.push({
        docId: String(m.DocID),
        firstName: String(m.First ?? "").trim(),
        lastName: String(m.Last ?? "").trim(),
        stateDist: String(m.StateDst ?? "").trim(),
        filingDate,
        year: filingDate.getFullYear(),
      });
    }
    if (year < toYear) await sleep(300);
  }

  return results;
}

// ─── PDF text parser ──────────────────────────────────────────

function parseTransactionsFromPdfText(text: string): Array<{
  ticker: string;
  transaction: string;
  transactionDate: Date;
  rangeRaw: string | null;
}> {
  // Normalize: collapse newlines and whitespace so multi-line spans become single lines
  const norm = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ");

  const results: Array<{
    ticker: string;
    transaction: string;
    transactionDate: Date;
    rangeRaw: string | null;
  }> = [];

  // Pattern: (TICKER) [ST]  P_or_S  MM/DD/YYYY  MM/DD/YYYY  $amount
  // [ST] = stock type; we skip bonds ([GS]), options ([OP]), mutual funds ([MF]), etc.
  // Dates run together without spaces in PDF text (e.g. 07/28/202508/11/2025)
  // Amount may contain spaces: "$1,001 - $15,000" or "$15,001 - $50,000" or "Over $250,000"
  const pattern =
    /\(([A-Z][A-Z0-9.]{0,5})\)\s*\[ST\]\s*(S\s*\(PARTIAL\)|[SP])\s*(\d{2}\/\d{2}\/\d{4})\d{2}\/\d{2}\/\d{4}\s*((?:Over\s*)?\$[\d,]+(?:\s*-\s*\$?[\d,]+)?)/gi;

  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
  while ((match = pattern.exec(norm)) !== null) {
    const [, ticker, txType, dateStr, amountStr] = match;
    const transactionDate = parseMDY(dateStr);
    if (!transactionDate) continue;

    // Skip obvious non-stock tickers: CUSIPs, too long, or "--"
    const t = ticker.toUpperCase();
    if (t === "--" || t.length > 6 || /^\d/.test(t)) continue;

    results.push({
      ticker: t,
      transaction: parseTransactionType(txType.trim()),
      transactionDate,
      rangeRaw: amountStr.replace(/\s+/g, " ").trim() || null,
    });
  }

  return results;
}

async function fetchFilingTransactions(
  filing: FilingMeta,
): Promise<RawTransaction[]> {
  const url = `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${filing.year}/${filing.docId}.pdf`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { "User-Agent": "PortfolioManager/1.0" },
    });
  } catch {
    return [];
  }

  if (!resp.ok) return [];

  const pdfBuf = Buffer.from(await resp.arrayBuffer());
  let parsed: Awaited<ReturnType<typeof pdfParse>>;
  try {
    parsed = await pdfParse(pdfBuf);
  } catch {
    return [];
  }

  const txs = parseTransactionsFromPdfText(parsed.text);
  return txs.map((tx) => ({ ...tx, assetName: null }));
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

  return ingestHouseFilings(fromDate, now);
}

/**
 * Core House pipeline for a date range: fetch the per-year filing index, pull
 * and parse each PTR PDF (5 concurrent), enrich distinct tickers via Yahoo, and
 * insert CongressTrade rows (skipDuplicates). Shared by the incremental cron and
 * the historical backfill so both behave identically.
 */
export async function ingestHouseFilings(
  fromDate: Date,
  toDate: Date,
): Promise<CongressSyncResult> {
  console.log(
    `[congress-trades] Fetching filings from ${fromDate.toISOString().slice(0, 10)} to ${toDate.toISOString().slice(0, 10)}`,
  );

  const filings = await fetchFilingIndex(fromDate, toDate);
  console.log(`[congress-trades] Found ${filings.length} PTR filings`);

  if (filings.length === 0) {
    return { ok: true, inserted: 0, skipped: 0, enriched: 0, filingCount: 0 };
  }

  // Fetch transactions — 5 concurrent PDF downloads
  type FilingResult = { filing: FilingMeta; txs: RawTransaction[] };
  const filingsWithTxs: FilingResult[] = [];

  for (let i = 0; i < filings.length; i += 5) {
    const batch = filings.slice(i, i + 5);
    const settled = await Promise.allSettled(
      batch.map(async (f) => ({
        filing: f,
        txs: await fetchFilingTransactions(f),
      })),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") filingsWithTxs.push(r.value);
    }
    if (i + 5 < filings.length) await sleep(300);
    if (i % 50 === 0 && i > 0) {
      console.log(`[congress-trades] Processed ${i}/${filings.length} filings`);
    }
  }

  // Enrich distinct tickers with Yahoo Finance
  const { cache: enrichmentCache, enriched } = await enrichTickers(
    filingsWithTxs.flatMap(({ txs }) => txs.map((tx) => tx.ticker)),
  );

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

  console.log(`[congress-trades] Built ${rows.length} rows to insert`);

  if (rows.length === 0) {
    return {
      ok: true,
      inserted: 0,
      skipped: 0,
      enriched,
      filingCount: filings.length,
    };
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
  buyVolume: number;
  sellVolume: number;
  buyScore: number;
  sellScore: number;
  politicians: string[];
  latestDate: Date;
};

// Blend trade count (breadth) and dollar volume (size) into a single 0–1 score.
// Each dimension is min-max normalized against the candidate set so "many small
// buyers" and "one whale" land on a comparable scale, then averaged equally.
export function blendScore(
  count: number,
  volume: number,
  maxCount: number,
  maxVolume: number,
): number {
  const nc = maxCount > 0 ? count / maxCount : 0;
  const nv = maxVolume > 0 ? volume / maxVolume : 0;
  return 0.5 * nc + 0.5 * nv;
}

export async function getTopClusters(opts: {
  since: Date;
  sector?: string;
  minAmount?: number;
  chamber?: string;
  limit?: number;
}): Promise<TradeCluster[]> {
  const { since, sector, minAmount, chamber, limit = 20 } = opts;
  const baseWhere = {
    transactionDate: { gte: since },
    ...(sector ? { sector } : {}),
    ...(minAmount ? { amountMid: { gte: minAmount } } : {}),
    ...(chamber ? { chamber } : {}),
  };

  const [buys, sells] = await Promise.all([
    db.congressTrade.groupBy({
      by: ["ticker"],
      where: { ...baseWhere, transaction: "Purchase" },
      _count: { _all: true },
      _sum: { amountMid: true },
      _max: { transactionDate: true },
    }),
    db.congressTrade.groupBy({
      by: ["ticker"],
      where: { ...baseWhere, transaction: { in: ["Sale", "Sale (Partial)"] } },
      _count: { _all: true },
      _sum: { amountMid: true },
      _max: { transactionDate: true },
    }),
  ]);

  const buyMap = new Map(
    buys.map((b) => [
      b.ticker,
      {
        count: b._count._all,
        volume: b._sum.amountMid ?? 0,
        latestDate: b._max.transactionDate!,
      },
    ]),
  );
  const sellMap = new Map(
    sells.map((s) => [
      s.ticker,
      {
        count: s._count._all,
        volume: s._sum.amountMid ?? 0,
        latestDate: s._max.transactionDate!,
      },
    ]),
  );

  const allTickers = new Set([...buyMap.keys(), ...sellMap.keys()]);
  type RawCluster = Omit<
    TradeCluster,
    "politicians" | "sector" | "buyScore" | "sellScore"
  >;
  const raw: RawCluster[] = [];

  for (const ticker of allTickers) {
    const b = buyMap.get(ticker);
    const s = sellMap.get(ticker);
    const buyCount = b?.count ?? 0;
    const sellCount = s?.count ?? 0;
    const buyVolume = b?.volume ?? 0;
    const sellVolume = s?.volume ?? 0;
    const latestDate =
      b?.latestDate && s?.latestDate
        ? b.latestDate > s.latestDate
          ? b.latestDate
          : s.latestDate
        : (b?.latestDate ?? s?.latestDate ?? new Date());
    raw.push({
      ticker,
      buyCount,
      sellCount,
      buyVolume,
      sellVolume,
      totalTrades: buyCount + sellCount,
      latestDate,
    });
  }

  const maxBuyCount = Math.max(0, ...raw.map((c) => c.buyCount));
  const maxSellCount = Math.max(0, ...raw.map((c) => c.sellCount));
  const maxBuyVolume = Math.max(0, ...raw.map((c) => c.buyVolume));
  const maxSellVolume = Math.max(0, ...raw.map((c) => c.sellVolume));

  const scored = raw.map((c) => ({
    ...c,
    buyScore: blendScore(c.buyCount, c.buyVolume, maxBuyCount, maxBuyVolume),
    sellScore: blendScore(
      c.sellCount,
      c.sellVolume,
      maxSellCount,
      maxSellVolume,
    ),
  }));

  // Keep the strongest clusters in either direction so a whale on one side
  // isn't dropped just because it lacks breadth on the other.
  scored.sort(
    (a, b) =>
      Math.max(b.buyScore, b.sellScore) - Math.max(a.buyScore, a.sellScore),
  );
  const top = scored.slice(0, limit);

  if (top.length === 0) return [];

  const topTickers = top.map((c) => c.ticker);

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
  buyVolume: number;
  sellVolume: number;
};

export async function getSectorBreakdown(
  since: Date,
  minAmount?: number,
  chamber?: string,
): Promise<SectorBreakdown[]> {
  const rows = await db.congressTrade.groupBy({
    by: ["sector", "transaction"],
    where: {
      transactionDate: { gte: since },
      sector: { not: null },
      ...(minAmount ? { amountMid: { gte: minAmount } } : {}),
      ...(chamber ? { chamber } : {}),
    },
    _count: { _all: true },
    _sum: { amountMid: true },
  });

  const map = new Map<string, SectorBreakdown>();
  for (const row of rows) {
    if (!row.sector) continue;
    if (!map.has(row.sector))
      map.set(row.sector, {
        sector: row.sector,
        buyCount: 0,
        sellCount: 0,
        buyVolume: 0,
        sellVolume: 0,
      });
    const entry = map.get(row.sector)!;
    const volume = row._sum.amountMid ?? 0;
    if (row.transaction === "Purchase") {
      entry.buyCount += row._count._all;
      entry.buyVolume += volume;
    } else {
      entry.sellCount += row._count._all;
      entry.sellVolume += volume;
    }
  }

  const sectors = Array.from(map.values());
  const maxCount = Math.max(0, ...sectors.map((s) => s.buyCount + s.sellCount));
  const maxVolume = Math.max(
    0,
    ...sectors.map((s) => s.buyVolume + s.sellVolume),
  );

  return sectors.sort(
    (a, b) =>
      blendScore(
        b.buyCount + b.sellCount,
        b.buyVolume + b.sellVolume,
        maxCount,
        maxVolume,
      ) -
      blendScore(
        a.buyCount + a.sellCount,
        a.buyVolume + a.sellVolume,
        maxCount,
        maxVolume,
      ),
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
  minAmount?: number;
  chamber?: string;
  page: number;
  pageSize?: number;
}): Promise<{ trades: CongressTradeRow[]; total: number }> {
  const {
    since,
    sector,
    ticker,
    transaction,
    minAmount,
    chamber,
    page,
    pageSize = 50,
  } = opts;

  const where = {
    transactionDate: { gte: since },
    ...(sector ? { sector } : {}),
    ...(ticker ? { ticker } : {}),
    ...(transaction ? { transaction } : {}),
    ...(minAmount ? { amountMid: { gte: minAmount } } : {}),
    ...(chamber ? { chamber } : {}),
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
  const [totalTrades, tickerGroups, politicianGroups, lastRun] =
    await Promise.all([
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
