import { XMLParser } from "fast-xml-parser";
import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// Corporate insider trades (SEC EDGAR Form 4)
//
// Form 4 volume is enormous, so we only ingest filings for issuers the user
// actually tracks — instruments that have a Trade (held) or a WatchlistItem.
// For each tracked ticker we resolve its CIK, pull recent Form 4 submissions,
// fetch the ownership XML, and store nonDerivative transactions in InsiderTrade.
//
// SEC requires a descriptive User-Agent with contact info and asks clients to
// stay under ~10 requests/second.
// ─────────────────────────────────────────────────────────────

const UA = "PortfolioManager/1.0 km.vivekananda@gmail.com";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

export type InsiderSyncResult = {
  ok: boolean;
  inserted: number;
  skipped: number;
  tickers: number;
  filings: number;
  error?: string;
};

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: true });

// Form 4 transaction codes → human label.
function normalizeCode(code: string): string {
  switch (code?.toUpperCase()) {
    case "P":
      return "Purchase";
    case "S":
      return "Sale";
    case "A":
      return "Award";
    case "M":
      return "Option Exercise";
    case "G":
      return "Gift";
    case "F":
      return "Tax Withholding";
    default:
      return "Other";
  }
}

// ─── CIK resolution ───────────────────────────────────────────

async function fetchTickerCikMap(): Promise<Map<string, string>> {
  const resp = await fetch(TICKERS_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error(`company_tickers HTTP ${resp.status}`);
  const json = (await resp.json()) as Record<
    string,
    { cik_str: number; ticker: string }
  >;
  const map = new Map<string, string>();
  for (const row of Object.values(json)) {
    map.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, "0"));
  }
  return map;
}

// ─── Form 4 fetch + parse ─────────────────────────────────────

type Form4Tx = {
  insiderName: string;
  insiderTitle: string | null;
  transactionCode: string;
  transaction: string;
  transactionDate: Date;
  shares: number | null;
  pricePerShare: number | null;
  sharesOwnedAfter: number | null;
};

function val(node: unknown): string | undefined {
  if (node == null) return undefined;
  if (
    typeof node === "object" &&
    "value" in (node as Record<string, unknown>)
  ) {
    const v = (node as Record<string, unknown>).value;
    return v == null ? undefined : String(v);
  }
  return String(node);
}

function num(node: unknown): number | null {
  const s = val(node);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function ownerTitle(rel: Record<string, unknown> | undefined): string | null {
  if (!rel) return null;
  const title = val(rel.officerTitle);
  if (title) return title;
  if (val(rel.isDirector) === "1" || val(rel.isDirector) === "true")
    return "Director";
  if (
    val(rel.isTenPercentOwner) === "1" ||
    val(rel.isTenPercentOwner) === "true"
  )
    return "10% Owner";
  return null;
}

function parseForm4(text: string): Form4Tx[] {
  let doc: Record<string, unknown>;
  try {
    doc = xml.parse(text) as Record<string, unknown>;
  } catch {
    return [];
  }
  const root = (doc.ownershipDocument ?? doc) as Record<string, unknown>;
  if (!root) return [];

  // Reporting owner (Form 4 usually has one; take the first if an array).
  const ownerRaw = root.reportingOwner;
  const owner = (Array.isArray(ownerRaw) ? ownerRaw[0] : ownerRaw) as
    | Record<string, unknown>
    | undefined;
  const ownerId = owner?.reportingOwnerId as
    | Record<string, unknown>
    | undefined;
  const insiderName = val(ownerId?.rptOwnerName) ?? "Unknown";
  const insiderTitle = ownerTitle(
    owner?.reportingOwnerRelationship as Record<string, unknown> | undefined,
  );

  const table = root.nonDerivativeTable as Record<string, unknown> | undefined;
  if (!table) return [];
  const txRaw = table.nonDerivativeTransaction;
  const txList = Array.isArray(txRaw) ? txRaw : txRaw ? [txRaw] : [];

  const out: Form4Tx[] = [];
  for (const t of txList as Record<string, unknown>[]) {
    const coding = t.transactionCoding as Record<string, unknown> | undefined;
    const amounts = t.transactionAmounts as Record<string, unknown> | undefined;
    const post = t.postTransactionAmounts as
      | Record<string, unknown>
      | undefined;
    const dateStr = val(t.transactionDate);
    const date = dateStr ? new Date(dateStr) : null;
    if (!date || Number.isNaN(date.getTime())) continue;

    const code = val(coding?.transactionCode) ?? "";
    out.push({
      insiderName,
      insiderTitle,
      transactionCode: code,
      transaction: normalizeCode(code),
      transactionDate: date,
      shares: num(amounts?.transactionShares),
      pricePerShare: num(amounts?.transactionPricePerShare),
      sharesOwnedAfter: num(post?.sharesOwnedFollowingTransaction),
    });
  }
  return out;
}

async function fetchForm4Xml(
  cikInt: string,
  accession: string,
): Promise<string | null> {
  const accNoDash = accession.replace(/-/g, "");
  const dir = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDash}`;
  let names: string[];
  try {
    const idxResp = await fetch(`${dir}/index.json`, {
      headers: { "User-Agent": UA },
    });
    if (!idxResp.ok) return null;
    const idx = (await idxResp.json()) as {
      directory?: { item?: { name: string }[] };
    };
    names = (idx.directory?.item ?? []).map((i) => i.name);
  } catch {
    return null;
  }

  // Pick the ownership XML: newer filings use "primary_doc.xml"; older ones a
  // custom name. Skip the XSL-rendered variants.
  const xmlName =
    names.find((n) => n === "primary_doc.xml") ??
    names.find((n) => /form4|ownership/i.test(n) && n.endsWith(".xml")) ??
    names.find((n) => n.endsWith(".xml") && !/^R\d|^xsl/i.test(n));
  if (!xmlName) return null;

  try {
    const resp = await fetch(`${dir}/${xmlName}`, {
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

// ─── Sync engine ──────────────────────────────────────────────

export async function runInsiderSync(
  _trigger: "cron" | "manual",
): Promise<InsiderSyncResult> {
  const lastRun = await db.cronJobRun.findFirst({
    where: { job: "insider-trades", ok: true },
    orderBy: { startedAt: "desc" },
  });
  const now = new Date();
  const fromDate = lastRun
    ? lastRun.startedAt
    : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fromISO = fromDate.toISOString().slice(0, 10);

  // Tickers of interest: instruments the user holds (have a Trade) or watches.
  const instruments = await db.instrument.findMany({
    where: {
      OR: [{ trades: { some: {} } }, { watchlistItems: { some: {} } }],
    },
    select: { id: true, symbol: true, sector: true, industry: true },
  });
  const bySymbol = new Map(instruments.map((i) => [i.symbol.toUpperCase(), i]));
  console.log(`[insider-trades] ${bySymbol.size} tracked ticker(s)`);

  if (bySymbol.size === 0) {
    return { ok: true, inserted: 0, skipped: 0, tickers: 0, filings: 0 };
  }

  const cikMap = await fetchTickerCikMap();

  const rows: {
    ticker: string;
    issuerName: string;
    insiderName: string;
    insiderTitle: string | null;
    transaction: string;
    transactionCode: string | null;
    transactionDate: Date;
    shares: number | null;
    pricePerShare: number | null;
    value: number | null;
    sharesOwnedAfter: number | null;
    accessionNo: string;
    instrumentId: string | null;
    sector: string | null;
    industry: string | null;
    externalKey: string;
  }[] = [];
  let filingCount = 0;

  const symbols = Array.from(bySymbol.keys());
  for (const symbol of symbols) {
    const cik = cikMap.get(symbol);
    const inst = bySymbol.get(symbol);
    if (!cik || !inst) continue;

    let submissions: {
      name?: string;
      filings?: {
        recent?: {
          form?: string[];
          accessionNumber?: string[];
          filingDate?: string[];
        };
      };
    };
    try {
      const resp = await fetch(
        `https://data.sec.gov/submissions/CIK${cik}.json`,
        { headers: { "User-Agent": UA } },
      );
      if (!resp.ok) continue;
      submissions = await resp.json();
    } catch {
      continue;
    }

    const recent = submissions.filings?.recent;
    const issuerName = submissions.name ?? symbol;
    const forms = recent?.form ?? [];
    const accessions = recent?.accessionNumber ?? [];
    const dates = recent?.filingDate ?? [];

    const cikInt = String(Number(cik)); // path uses the non-padded CIK
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] !== "4") continue;
      if ((dates[i] ?? "") < fromISO) continue;
      const accession = accessions[i];
      if (!accession) continue;

      filingCount++;
      const text = await fetchForm4Xml(cikInt, accession);
      await sleep(120); // ~8 req/s ceiling
      if (!text) continue;

      for (const tx of parseForm4(text)) {
        const value =
          tx.shares != null && tx.pricePerShare != null
            ? tx.shares * tx.pricePerShare
            : null;
        rows.push({
          ticker: symbol,
          issuerName,
          insiderName: tx.insiderName,
          insiderTitle: tx.insiderTitle,
          transaction: tx.transaction,
          transactionCode: tx.transactionCode || null,
          transactionDate: tx.transactionDate,
          shares: tx.shares,
          pricePerShare: tx.pricePerShare,
          value,
          sharesOwnedAfter: tx.sharesOwnedAfter,
          accessionNo: accession,
          instrumentId: inst.id,
          sector: inst.sector,
          industry: inst.industry,
          externalKey: [
            accession,
            tx.transactionDate.toISOString().slice(0, 10),
            tx.transactionCode,
            tx.shares ?? "",
            tx.insiderName,
          ].join("|"),
        });
      }
    }
  }

  console.log(
    `[insider-trades] ${filingCount} Form 4 filing(s), ${rows.length} transaction row(s)`,
  );
  if (rows.length === 0) {
    return {
      ok: true,
      inserted: 0,
      skipped: 0,
      tickers: bySymbol.size,
      filings: filingCount,
    };
  }

  const { count } = await db.insiderTrade.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return {
    ok: true,
    inserted: count,
    skipped: rows.length - count,
    tickers: bySymbol.size,
    filings: filingCount,
  };
}

// ─── Query helpers (page) ─────────────────────────────────────

export async function getInsiderSummary(since: Date) {
  const [total, tickerGroups, insiderGroups, lastRun] = await Promise.all([
    db.insiderTrade.count({ where: { transactionDate: { gte: since } } }),
    db.insiderTrade.groupBy({
      by: ["ticker"],
      where: { transactionDate: { gte: since } },
      _count: { _all: true },
    }),
    db.insiderTrade.groupBy({
      by: ["insiderName"],
      where: { transactionDate: { gte: since } },
      _count: { _all: true },
    }),
    db.cronJobRun.findFirst({
      where: { job: "insider-trades" },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  return {
    totalTrades: total,
    uniqueTickers: tickerGroups.length,
    uniqueInsiders: insiderGroups.length,
    lastSyncAt: lastRun?.finishedAt ?? null,
    lastSyncOk: lastRun?.ok ?? null,
  };
}

export type InsiderTradeRow = {
  id: string;
  ticker: string;
  issuerName: string;
  insiderName: string;
  insiderTitle: string | null;
  transaction: string;
  transactionDate: Date;
  shares: number | null;
  pricePerShare: number | null;
  value: number | null;
};

export async function getFilteredInsiderTrades(opts: {
  since: Date;
  ticker?: string;
  transaction?: string;
  page: number;
  pageSize?: number;
}): Promise<{ trades: InsiderTradeRow[]; total: number }> {
  const { since, ticker, transaction, page, pageSize = 50 } = opts;
  const where = {
    transactionDate: { gte: since },
    ...(ticker ? { ticker } : {}),
    ...(transaction ? { transaction } : {}),
  };

  const [trades, total] = await Promise.all([
    db.insiderTrade.findMany({
      where,
      orderBy: { transactionDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        ticker: true,
        issuerName: true,
        insiderName: true,
        insiderTitle: true,
        transaction: true,
        transactionDate: true,
        shares: true,
        pricePerShare: true,
        value: true,
      },
    }),
    db.insiderTrade.count({ where }),
  ]);

  return { trades, total };
}
