import {
  type CongressSyncResult,
  enrichTickers,
  parseAmountRange,
} from "@/lib/congress-trades";
import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// Senate Periodic Transaction Reports (efdsearch.senate.gov)
//
// The Senate eFD site has no public API. Access requires:
//   1. GET the search page to obtain a CSRF token cookie.
//   2. POST the "prohibition agreement" (terms of service) to get a session.
//   3. POST the DataTables-style report search endpoint for PTR rows.
//   4. Fetch each *electronic* PTR's HTML and scrape its transaction table.
// Paper (scanned) PTRs cannot be parsed and are skipped.
//
// Rows are stored in the shared CongressTrade table with chamber = "Senate".
// ─────────────────────────────────────────────────────────────

const BASE = "https://efdsearch.senate.gov";
const SEARCH_HOME = `${BASE}/search/home/`;
const SEARCH_INDEX = `${BASE}/search/`;
const REPORT_DATA = `${BASE}/search/report/data/`;
const PAGE_SIZE = 100;

// eFD sits behind a WAF that blocks non-browser clients. A full browser header
// set gets 200 from a residential IP; datacenter IPs may still be challenged.
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "sec-ch-ua":
    '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

function parseMDY(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = raw.trim().match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const date = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  return Number.isNaN(date.getTime()) ? null : date;
}

// Normalize Senate transaction-type labels to match the House conventions
// already used elsewhere ("Purchase" / "Sale" / "Sale (Partial)" / "Exchange").
function normalizeSenateType(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (t.startsWith("purchase")) return "Purchase";
  if (t.includes("partial")) return "Sale (Partial)";
  if (t.startsWith("sale")) return "Sale";
  if (t.startsWith("exchange")) return "Exchange";
  return raw.trim() || "Unknown";
}

// ─── Session / cookie handling ────────────────────────────────

type Session = { cookie: string; csrf: string };

function readCookies(resp: Response, jar: Map<string, string>) {
  // Node fetch exposes multiple Set-Cookie headers via getSetCookie().
  const setCookies =
    typeof resp.headers.getSetCookie === "function"
      ? resp.headers.getSetCookie()
      : resp.headers.get("set-cookie")
        ? [resp.headers.get("set-cookie") as string]
        : [];
  for (const c of setCookies) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function establishSession(): Promise<Session> {
  const jar = new Map<string, string>();

  // 1. Land on the search page to seed the CSRF cookie.
  const landing = await fetch(SEARCH_INDEX, {
    headers: BROWSER_HEADERS,
  });
  readCookies(landing, jar);
  const html = await landing.text();
  const tokenMatch = html.match(
    /name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/i,
  );
  const csrf = jar.get("csrftoken") ?? tokenMatch?.[1] ?? "";
  if (!csrf) {
    const snippet = html.slice(0, 160).replace(/\s+/g, " ").trim();
    throw new Error(
      `could not obtain Senate eFD CSRF token — landing HTTP ${landing.status}, ${html.length}b. Likely a WAF block on this IP. Snippet: ${snippet}`,
    );
  }

  // 2. Accept the prohibition agreement (terms of service) → session cookie.
  const agree = await fetch(SEARCH_HOME, {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: SEARCH_HOME,
      Cookie: cookieHeader(jar),
    },
    body: new URLSearchParams({
      csrfmiddlewaretoken: tokenMatch?.[1] ?? csrf,
      prohibition_agreement: "1",
    }).toString(),
    redirect: "manual",
  });
  readCookies(agree, jar);

  return { cookie: cookieHeader(jar), csrf: jar.get("csrftoken") ?? csrf };
}

// ─── Report search ────────────────────────────────────────────

type SenateReport = {
  filerName: string;
  office: string;
  reportUrl: string;
  reportUuid: string;
  filedDate: Date | null;
};

function formatDateTimeParam(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()} 00:00:00`;
}

async function fetchReportPage(
  session: Session,
  start: number,
  fromDate: Date,
): Promise<{ rows: SenateReport[]; total: number }> {
  const body = new URLSearchParams({
    start: String(start),
    length: String(PAGE_SIZE),
    report_types: "[11]", // 11 = Periodic Transaction Report
    filer_types: "[]",
    submitted_start_date: formatDateTimeParam(fromDate),
    submitted_end_date: "",
    candidate_state: "",
    senator_state: "",
    office_id: "",
    first_name: "",
    last_name: "",
    csrfmiddlewaretoken: session.csrf,
  });

  const resp = await fetch(REPORT_DATA, {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${BASE}/search/`,
      Cookie: session.cookie,
      "X-CSRFToken": session.csrf,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body.toString(),
  });

  if (!resp.ok) throw new Error(`Senate report search HTTP ${resp.status}`);
  const json = (await resp.json()) as {
    data?: string[][];
    recordsTotal?: number;
  };

  const rows: SenateReport[] = [];
  for (const r of json.data ?? []) {
    // r = [firstName, lastName, office, <a href=...>type</a>, filedDate]
    const linkCell = r[3] ?? "";
    const hrefMatch = linkCell.match(/href=["']([^"']+)["']/i);
    const href = hrefMatch?.[1] ?? "";
    if (!href.includes("/ptr/")) continue; // skip paper filings here too
    const uuidMatch = href.match(/\/ptr\/([0-9a-f-]+)\//i);
    rows.push({
      filerName: `${(r[0] ?? "").trim()} ${(r[1] ?? "").trim()}`.trim(),
      office: (r[2] ?? "").replace(/<[^>]+>/g, "").trim(),
      reportUrl: href.startsWith("http") ? href : `${BASE}${href}`,
      reportUuid: uuidMatch?.[1] ?? href,
      filedDate: parseMDY(r[4]),
    });
  }

  return { rows, total: json.recordsTotal ?? rows.length };
}

// ─── PTR transaction-table parsing ────────────────────────────

type SenateTx = {
  ticker: string;
  assetName: string | null;
  transaction: string;
  transactionDate: Date;
  rangeRaw: string | null;
};

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSenatePtr(html: string): SenateTx[] {
  const txs: SenateTx[] = [];
  const bodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const body = bodyMatch?.[1] ?? html;

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
  while ((rowMatch = rowRe.exec(body)) !== null) {
    const cells = Array.from(
      rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi),
    ).map((c) => stripTags(c[1]));
    if (cells.length < 8) continue;

    // Columns: #, TxDate, Owner, Ticker, AssetName, AssetType, Type, Amount, [Comment]
    const transactionDate = parseMDY(cells[1]);
    const tickerRaw = cells[3];
    const assetType = cells[5] ?? "";
    const typeRaw = cells[6] ?? "";
    const amount = cells[7] ?? "";
    if (!transactionDate) continue;

    // Equities only — mirror the House [ST] filter; skip options/bonds/funds.
    if (!/stock/i.test(assetType) || /option/i.test(assetType)) continue;

    const ticker = tickerRaw.toUpperCase();
    if (!ticker || ticker === "--" || ticker.length > 6 || /^\d/.test(ticker)) {
      continue;
    }

    txs.push({
      ticker,
      assetName: cells[4] || null,
      transaction: normalizeSenateType(typeRaw),
      transactionDate,
      rangeRaw: amount.replace(/\s+/g, " ").trim() || null,
    });
  }

  return txs;
}

async function fetchPtrTransactions(
  session: Session,
  report: SenateReport,
): Promise<SenateTx[]> {
  let resp: Response;
  try {
    resp = await fetch(report.reportUrl, {
      headers: {
        ...BROWSER_HEADERS,
        Cookie: session.cookie,
        Referer: `${BASE}/search/`,
      },
    });
  } catch {
    return [];
  }
  if (!resp.ok) return [];
  return parseSenatePtr(await resp.text());
}

// ─── Sync engine ──────────────────────────────────────────────

export async function runSenateSync(
  _trigger: "cron" | "manual",
): Promise<CongressSyncResult> {
  const lastRun = await db.cronJobRun.findFirst({
    where: { job: "senate-trades", ok: true },
    orderBy: { startedAt: "desc" },
  });

  const now = new Date();
  const fromDate = lastRun
    ? lastRun.startedAt
    : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  console.log(
    `[senate-trades] Fetching reports filed since ${fromDate.toISOString().slice(0, 10)}`,
  );

  const session = await establishSession();

  // Page through the report search.
  const reports: SenateReport[] = [];
  let start = 0;
  for (let guard = 0; guard < 200; guard++) {
    const { rows, total } = await fetchReportPage(session, start, fromDate);
    reports.push(...rows);
    start += PAGE_SIZE;
    if (start >= total || rows.length === 0) break;
    await sleep(300);
  }
  console.log(`[senate-trades] Found ${reports.length} electronic PTR(s)`);

  if (reports.length === 0) {
    return { ok: true, inserted: 0, skipped: 0, enriched: 0, filingCount: 0 };
  }

  // Fetch + parse each PTR, 5 concurrent.
  const reportsWithTxs: { report: SenateReport; txs: SenateTx[] }[] = [];
  for (let i = 0; i < reports.length; i += 5) {
    const batch = reports.slice(i, i + 5);
    const settled = await Promise.allSettled(
      batch.map(async (r) => ({
        report: r,
        txs: await fetchPtrTransactions(session, r),
      })),
    );
    for (const s of settled) {
      if (s.status === "fulfilled") reportsWithTxs.push(s.value);
    }
    if (i + 5 < reports.length) await sleep(300);
  }

  const { cache: enrichmentCache, enriched } = await enrichTickers(
    reportsWithTxs.flatMap(({ txs }) => txs.map((t) => t.ticker)),
  );

  const rows = reportsWithTxs.flatMap(({ report, txs }) =>
    txs.map((tx) => {
      const amounts = parseAmountRange(tx.rangeRaw);
      const enrichment = enrichmentCache.get(tx.ticker) ?? null;
      return {
        politician: report.filerName,
        stateDist: report.office || null,
        chamber: "Senate",
        ticker: tx.ticker,
        assetName: tx.assetName,
        transaction: tx.transaction,
        transactionDate: tx.transactionDate,
        reportDate: report.filedDate,
        rangeRaw: tx.rangeRaw,
        amountLow: amounts.low,
        amountHigh: amounts.high,
        amountMid: amounts.mid,
        instrumentId: enrichment?.instrumentId ?? null,
        sector: enrichment?.sector ?? null,
        industry: enrichment?.industry ?? null,
        externalKey: [
          "Senate",
          report.reportUuid,
          tx.transactionDate.toISOString().slice(0, 10),
          tx.ticker,
          tx.transaction,
        ].join("|"),
      };
    }),
  );

  console.log(`[senate-trades] Built ${rows.length} rows to insert`);
  if (rows.length === 0) {
    return {
      ok: true,
      inserted: 0,
      skipped: 0,
      enriched,
      filingCount: reports.length,
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
    filingCount: reports.length,
  };
}
