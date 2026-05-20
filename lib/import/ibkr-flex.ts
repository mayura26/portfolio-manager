import type { ParsedCashTx, ParsedStatement, ParsedTrade } from "./ibkr-csv";

// Flex Web Service v3 endpoints.
// Docs: https://www.interactivebrokers.com/campus/ibkr-api-page/flex-web-service/
const FLEX_BASE =
  "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";

// User-Agent is required by the Flex Web Service.
const USER_AGENT = "portfolio-manager/0.1 (Java)";

// Transient server-side error codes that should be retried with backoff.
// 1001/1004-1009/1021 can come back from either SendRequest or GetStatement;
// 1019 ("generation in progress") is the normal polling-loop signal.
const TRANSIENT_ERROR_CODES = new Set([
  "1001",
  "1004",
  "1005",
  "1006",
  "1007",
  "1008",
  "1009",
  "1019",
  "1021",
]);

// IBKR pacing: max 1 request/second, 10 requests/minute per token (error 1018).
const MIN_REQUEST_GAP_MS = 1100;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
  return match ? match[1].trim() : null;
}

function extractAttr(element: string, attr: string): string {
  const match = element.match(new RegExp(`${attr}="([^"]*)"`));
  return match ? match[1] : "";
}

function extractFirstAttr(element: string, attrs: string[]): string {
  for (const attr of attrs) {
    const value = extractAttr(element, attr);
    if (value) return value;
  }
  return "";
}

function parseFlexDate(raw: string): Date {
  // Format: "20240115;093000"
  const [datePart, timePart = "000000"] = raw.split(";");
  const year = datePart.slice(0, 4);
  const month = datePart.slice(4, 6);
  const day = datePart.slice(6, 8);
  const hh = timePart.slice(0, 2);
  const mm = timePart.slice(2, 4);
  const ss = timePart.slice(4, 6);
  return new Date(`${year}-${month}-${day}T${hh}:${mm}:${ss}`);
}

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/xml" },
  });
  if (!res.ok) throw new Error(`Flex request failed: ${res.status}`);
  return res.text();
}

type FlexError = { code: string; message: string };

function readFlexError(xml: string): FlexError | null {
  const code = extractTag(xml, "ErrorCode");
  if (!code || code === "0") return null;
  return {
    code,
    message: extractTag(xml, "ErrorMessage") ?? "Unknown error",
  };
}

export async function fetchFlexStatement(
  token: string,
  queryId: string,
): Promise<ParsedStatement> {
  // Step 1: SendRequest — retry on transient errors (1001, 1004-1009, 1021).
  const sendUrl = `${FLEX_BASE}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`;

  let referenceCode: string | null = null;
  let lastSendError: FlexError | null = null;
  const sendMaxAttempts = 5;

  for (let attempt = 0; attempt < sendMaxAttempts; attempt++) {
    if (attempt > 0) {
      // Exponential-ish backoff, respecting the 1 req/sec rule.
      await sleep(Math.max(MIN_REQUEST_GAP_MS, 5000 * 2 ** (attempt - 1)));
    }

    const xml = await fetchXml(sendUrl);
    const err = readFlexError(xml);

    if (!err) {
      referenceCode = extractTag(xml, "ReferenceCode");
      if (!referenceCode) {
        throw new Error("IBKR Flex: missing ReferenceCode in response");
      }
      break;
    }

    lastSendError = err;
    if (!TRANSIENT_ERROR_CODES.has(err.code)) {
      throw new Error(`IBKR Flex error ${err.code}: ${err.message}`);
    }
  }

  if (!referenceCode) {
    const msg = lastSendError
      ? `${lastSendError.code}: ${lastSendError.message}`
      : "unknown";
    throw new Error(
      `IBKR Flex: SendRequest failed after ${sendMaxAttempts} attempts (last error ${msg})`,
    );
  }

  // Step 2: GetStatement — poll until ready. The <url> field returned by
  // SendRequest is documented as a legacy value to be ignored; we build the
  // GetStatement URL ourselves against the v3 endpoint.
  const getUrl = `${FLEX_BASE}/GetStatement?t=${encodeURIComponent(token)}&q=${encodeURIComponent(referenceCode)}&v=3`;

  // Per IBKR docs, large statements may take a while; give the backend a head
  // start before the first poll.
  await sleep(5000);

  let reportXml = "";
  const pollMaxAttempts = 20;
  let lastPollError: FlexError | null = null;

  for (let attempt = 0; attempt < pollMaxAttempts; attempt++) {
    if (attempt > 0) await sleep(5000);

    const xml = await fetchXml(getUrl);
    const err = readFlexError(xml);

    if (!err) {
      reportXml = xml;
      break;
    }

    lastPollError = err;
    if (!TRANSIENT_ERROR_CODES.has(err.code)) {
      throw new Error(`IBKR Flex poll error ${err.code}: ${err.message}`);
    }
  }

  if (!reportXml) {
    const msg = lastPollError
      ? `${lastPollError.code}: ${lastPollError.message}`
      : "no response";
    throw new Error(`IBKR Flex: report not ready after polling (last: ${msg})`);
  }

  return parseFlexStatementXml(reportXml);
}

export function parseFlexStatementXml(reportXml: string): ParsedStatement {
  // Parse <Trade .../> elements
  const trades: ParsedTrade[] = [];
  const tradeElements = reportXml.match(/<Trade\s[^>]*\/>/g) ?? [];

  for (const el of tradeElements) {
    if (extractAttr(el, "assetCategory") !== "STK") continue;

    try {
      const symbol = extractAttr(el, "symbol");
      const currency = extractAttr(el, "currency");
      const conid = extractFirstAttr(el, ["conid", "Conid"]);
      const listingExchange = extractFirstAttr(el, [
        "listingExchange",
        "ListingExchange",
      ]);
      const rawDate = extractAttr(el, "dateTime");
      const rawQty = extractAttr(el, "quantity");
      const rawPrice = extractAttr(el, "tradePrice");
      const rawFee = extractAttr(el, "ibCommission");
      const tradeId = extractAttr(el, "tradeID");

      if (!symbol || !currency || !rawDate || !rawQty || !rawPrice) continue;

      const qty = Number.parseFloat(rawQty);
      if (Number.isNaN(qty) || qty === 0) continue;

      const price = Number.parseFloat(rawPrice);
      if (Number.isNaN(price) || price <= 0) continue;

      const date = parseFlexDate(rawDate);
      const type: "BUY" | "SELL" = qty > 0 ? "BUY" : "SELL";
      const quantity = Math.abs(qty).toString();
      const fees = Math.max(
        0,
        Math.abs(Number.parseFloat(rawFee) || 0),
      ).toString();

      trades.push({
        symbol,
        currency,
        conid: conid || undefined,
        listingExchange: listingExchange || undefined,
        date,
        quantity,
        type,
        price: price.toString(),
        fees,
        externalRef: tradeId,
      });
    } catch {
      // Skip unparseable elements
    }
  }

  // Parse <CashTransaction .../> elements
  const cashTxs: ParsedCashTx[] = [];
  const cashElements = reportXml.match(/<CashTransaction\s[^>]*\/>/g) ?? [];

  for (const el of cashElements) {
    const txType = extractAttr(el, "type");

    let mappedType: ParsedCashTx["type"] | null = null;
    if (txType === "Deposits/Withdrawals") {
      mappedType = null; // determined by amount sign below
    } else if (txType === "Dividends") {
      mappedType = "DIVIDEND";
    } else {
      continue; // skip Interest, Withholding Tax, Fees, etc.
    }

    try {
      const currency = extractAttr(el, "currency");
      const rawDate = extractAttr(el, "dateTime");
      const rawAmount = extractAttr(el, "amount");
      const description = extractAttr(el, "description");
      const transactionId = extractAttr(el, "transactionID");

      if (!currency || !rawDate || !rawAmount) continue;

      const amount = Number.parseFloat(rawAmount);
      if (Number.isNaN(amount) || amount === 0) continue;

      const date = parseFlexDate(rawDate);
      const finalType: ParsedCashTx["type"] =
        mappedType ?? (amount > 0 ? "DEPOSIT" : "WITHDRAWAL");

      cashTxs.push({
        currency,
        date,
        amount: amount.toString(),
        type: finalType,
        description,
        externalRef: transactionId,
      });
    } catch {
      // Skip unparseable elements
    }
  }

  return { trades, cashTxs };
}

// Kept for backwards compatibility with any existing callers
export async function fetchFlexTrades(
  token: string,
  queryId: string,
): Promise<ParsedTrade[]> {
  const { trades } = await fetchFlexStatement(token, queryId);
  return trades;
}
