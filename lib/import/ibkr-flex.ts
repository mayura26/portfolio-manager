import type { ParsedCashTx, ParsedStatement, ParsedTrade } from "./ibkr-csv";

const FLEX_BASE =
  "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService";

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
  return match ? match[1].trim() : null;
}

function extractAttr(element: string, attr: string): string {
  const match = element.match(new RegExp(`${attr}="([^"]*)"`));
  return match ? match[1] : "";
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Flex request failed: ${res.status}`);
  return res.text();
}

export async function fetchFlexStatement(
  token: string,
  queryId: string,
): Promise<ParsedStatement> {
  // Step 1: send the request and get a reference code
  const initUrl = `${FLEX_BASE}.SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`;
  const initXml = await fetchXml(initUrl);

  const errorCode = extractTag(initXml, "ErrorCode");
  if (errorCode && errorCode !== "0") {
    const errorMsg = extractTag(initXml, "ErrorMessage") ?? "Unknown error";
    throw new Error(`IBKR Flex error ${errorCode}: ${errorMsg}`);
  }

  const referenceCode = extractTag(initXml, "ReferenceCode");
  const reportUrl = extractTag(initXml, "Url");
  if (!referenceCode || !reportUrl) {
    throw new Error("IBKR Flex: missing ReferenceCode or Url in response");
  }

  // Step 2: poll until the report is ready
  const pollUrl = `${reportUrl}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(referenceCode)}&v=3`;
  let reportXml = "";

  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));

    const xml = await fetchXml(pollUrl);
    const statusCode = extractTag(xml, "ErrorCode");

    // 1019 = "Statement generation in progress"
    if (statusCode === "1019") continue;

    if (statusCode && statusCode !== "0") {
      const msg = extractTag(xml, "ErrorMessage") ?? "Unknown error";
      throw new Error(`IBKR Flex poll error ${statusCode}: ${msg}`);
    }

    reportXml = xml;
    break;
  }

  if (!reportXml) throw new Error("IBKR Flex: report timed out after 30s");

  // Step 3: parse <Trade .../> elements
  const trades: ParsedTrade[] = [];
  const tradeElements = reportXml.match(/<Trade [^/]+\/>/g) ?? [];

  for (const el of tradeElements) {
    if (extractAttr(el, "assetCategory") !== "STK") continue;

    try {
      const symbol = extractAttr(el, "symbol");
      const currency = extractAttr(el, "currency");
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

  // Step 4: parse <CashTransaction .../> elements
  const cashTxs: ParsedCashTx[] = [];
  const cashElements = reportXml.match(/<CashTransaction [^/]+\/>/g) ?? [];

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
