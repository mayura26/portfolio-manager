import pdfParse from "pdf-parse";
import { parseAmountRange } from "@/lib/congress-trades";
import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// Executive-branch trades (OGE Form 278-T) — e.g. President Trump
//
// The President is NOT listed in OGE's enumerable "PAS Index" view (that view
// is Senate-confirmed appointees), so his filings can't be auto-discovered.
// Instead we keep a curated list of his 278-T document URLs (he files a few
// times a year — add new ones here as they're published). Each is an OCR'd
// scanned PDF of mostly bonds/funds with no tickers, parsed best-effort into
// ExecutiveTrade rows (asset name + buy/sell + date; amount when alignable).
// ─────────────────────────────────────────────────────────────

const UA = "PortfolioManager/1.0 km.vivekananda@gmail.com";

type OgeFiling = { filer: string; docId: string; url: string };

// Curated OGE 278-T filings. Append new document URLs as they're published.
const OGE_FILINGS: OgeFiling[] = [
  {
    filer: "Donald J. Trump",
    docId: "18353894FE440B3685258D430031A337",
    url: "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/18353894FE440B3685258D430031A337/$FILE/Donald%20J.%20Trump%2010.20.2025%20278-T%20(2).pdf",
  },
  {
    filer: "Donald J. Trump",
    docId: "405E4EC4E27BE8D185258DF7002DD1C0",
    url: "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/405E4EC4E27BE8D185258DF7002DD1C0/$FILE/Trump,%20Donald%20J.-05.08.2026-278T(2).pdf",
  },
];

export type ExecutiveSyncResult = {
  ok: boolean;
  inserted: number;
  skipped: number;
  filings: number;
  error?: string;
};

// Repair common OCR digit confusions inside a date token, then ISO-format it.
function fixDate(raw: string): Date | null {
  const fixed = raw.replace(/[SsZBbgIl|O]/g, (c) => {
    const map: Record<string, string> = {
      S: "5",
      s: "5",
      Z: "2",
      B: "8",
      b: "6",
      g: "9",
      I: "1",
      l: "1",
      "|": "1",
      O: "0",
    };
    return map[c] ?? c;
  });
  const m = fixed.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
  const d = new Date(
    `${yyyy}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

function classify(name: string): string {
  if (/\bETF\b|FUND|TRUST/i.test(name)) return "Fund";
  if (
    /NOTE|DEB|BOND|DUE \d|SR |SENIOR|UNSECURED|REGS|REV |TAX |OBLIG|MUNI|SECURITY/i.test(
      name,
    )
  )
    return "Bond";
  return "Other";
}

type ParsedTx = {
  assetName: string;
  assetClass: string;
  transaction: string;
  transactionDate: Date | null;
  rangeRaw: string | null;
};

export function parseOge278T(text: string): ParsedTx[] {
  const norm = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ");
  const anchor =
    /(purc\s*hase|purchase|sale|exchange)\s+(\d{1,2}\/\d{1,2}\/\d{2,4}[A-Za-z0-9]?)\s+(No|Yes|N\s*o)/gi;

  const txs: Omit<ParsedTx, "rangeRaw">[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
  while ((m = anchor.exec(norm)) !== null) {
    let desc = norm.slice(last, m.index).trim();
    last = anchor.lastIndex;
    desc = desc.replace(/^\d{1,3}\s+/, "").replace(/^[•"'*.\s]+/, "");
    desc = desc.split(
      /\s+(?:DISCRETIONARY|DISCRETION|B\/E|MS \d|JJ \d|AO \d|FA \d|MN \d)/i,
    )[0];
    desc = desc.trim();
    if (desc.length < 4 || desc.length > 90) continue;

    const typeRaw = m[1].replace(/\s+/g, "").toLowerCase();
    txs.push({
      assetName: desc,
      assetClass: classify(desc),
      transaction: typeRaw.startsWith("sale")
        ? "Sale"
        : typeRaw.startsWith("exchange")
          ? "Exchange"
          : "Purchase",
      transactionDate: fixDate(m[2]),
    });
  }

  // Amount column block(s). Only align by index when the counts match exactly,
  // since the OCR'd column layout can drift — wrong amounts are worse than none.
  const amounts = (
    norm.match(/\$[\d,]+\s*-\s*\$?[\d,]+|Over\s+\$[\d,]+/gi) ?? []
  ).map((a) =>
    a
      .replace(/\s+/g, " ")
      .replace(/\$(\d)/g, "$ $1")
      .replace(/\s+/g, " ")
      .trim(),
  );
  const aligned = amounts.length === txs.length;

  return txs.map((t, i) => ({
    ...t,
    rangeRaw: aligned ? (amounts[i] ?? null) : null,
  }));
}

async function fetchFilingTransactions(filing: OgeFiling): Promise<ParsedTx[]> {
  try {
    const resp = await fetch(filing.url, { headers: { "User-Agent": UA } });
    if (!resp.ok) return [];
    const buf = Buffer.from(await resp.arrayBuffer());
    const parsed = await pdfParse(buf);
    return parseOge278T(parsed.text);
  } catch {
    return [];
  }
}

export async function runExecutiveSync(
  _trigger: "cron" | "manual",
): Promise<ExecutiveSyncResult> {
  console.log(`[executive-trades] ${OGE_FILINGS.length} curated filing(s)`);

  const rows: {
    filer: string;
    assetName: string;
    assetClass: string | null;
    transaction: string;
    transactionDate: Date | null;
    rangeRaw: string | null;
    amountLow: number | null;
    amountHigh: number | null;
    amountMid: number | null;
    docId: string;
    externalKey: string;
  }[] = [];

  for (const filing of OGE_FILINGS) {
    const txs = await fetchFilingTransactions(filing);
    console.log(`[executive-trades] ${filing.docId}: ${txs.length} txns`);
    txs.forEach((tx, idx) => {
      const amounts = parseAmountRange(tx.rangeRaw);
      rows.push({
        filer: filing.filer,
        assetName: tx.assetName,
        assetClass: tx.assetClass,
        transaction: tx.transaction,
        transactionDate: tx.transactionDate,
        rangeRaw: tx.rangeRaw,
        amountLow: amounts.low,
        amountHigh: amounts.high,
        amountMid: amounts.mid,
        docId: filing.docId,
        externalKey: [filing.docId, idx, tx.transaction].join("|"),
      });
    });
  }

  if (rows.length === 0) {
    return { ok: true, inserted: 0, skipped: 0, filings: OGE_FILINGS.length };
  }

  const { count } = await db.executiveTrade.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return {
    ok: true,
    inserted: count,
    skipped: rows.length - count,
    filings: OGE_FILINGS.length,
  };
}

// ─── Query helpers (Executive tab) ────────────────────────────

export type ExecutiveTradeRow = {
  id: string;
  filer: string;
  assetName: string;
  assetClass: string | null;
  transaction: string;
  transactionDate: Date | null;
  rangeRaw: string | null;
};

export async function getExecutiveTrades(opts: {
  page: number;
  pageSize?: number;
}): Promise<{ trades: ExecutiveTradeRow[]; total: number; filers: string[] }> {
  const { page, pageSize = 50 } = opts;
  const [trades, total, filerGroups] = await Promise.all([
    db.executiveTrade.findMany({
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        filer: true,
        assetName: true,
        assetClass: true,
        transaction: true,
        transactionDate: true,
        rangeRaw: true,
      },
    }),
    db.executiveTrade.count(),
    db.executiveTrade.groupBy({ by: ["filer"] }),
  ]);
  return { trades, total, filers: filerGroups.map((f) => f.filer) };
}
