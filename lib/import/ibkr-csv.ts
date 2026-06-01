import { createHash } from "node:crypto";

export type ParsedTrade = {
  symbol: string;
  currency: string;
  conid?: string;
  listingExchange?: string;
  date: Date;
  quantity: string;
  type: "BUY" | "SELL";
  price: string;
  fees: string;
  externalRef: string;
};

export type ParsedCashTxType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "DIVIDEND"
  | "INTEREST"
  | "FEE"
  | "WITHHOLDING"
  | "FX_IN"
  | "FX_OUT";

export type ParsedCashTx = {
  currency: string;
  date: Date;
  // For FEE/INTEREST/WITHHOLDING the sign is meaningful and preserved on import;
  // for all other types the magnitude is used and direction comes from the type.
  amount: string;
  type: ParsedCashTxType;
  description: string;
  externalRef: string;
};

export type ParsedStatement = {
  trades: ParsedTrade[];
  cashTxs: ParsedCashTx[];
};

function parseRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseIbkrDate(raw: string): Date {
  // Handles "YYYY-MM-DD, HH:MM:SS", "YYYY-MM-DD; HH:MM:SS", and plain "YYYY-MM-DD"
  const cleaned = raw.replace(/[,;]\s*/, "T").replace(/\s+/g, "");
  const d = new Date(cleaned);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${raw}`);
  return d;
}

function fingerprint(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export function parseIbkrCsv(raw: string): ParsedStatement {
  const lines = raw.split(/\r?\n/);

  // Section header maps: sectionName → colIndex
  const sectionHeaders = new Map<string, Record<string, number>>();

  const trades: ParsedTrade[] = [];
  const cashTxs: ParsedCashTx[] = [];

  for (const line of lines) {
    if (!line) continue;

    const fields = parseRow(line);
    if (fields.length < 3) continue;

    const section = fields[0];
    const rowType = fields[1];

    // Track header rows for each section we care about
    const trackedSections = new Set([
      "Trades",
      "Deposits & Withdrawals",
      "Dividends",
      "Interest",
      "Withholding Tax",
      "Fees",
    ]);
    if (!trackedSections.has(section)) continue;

    if (rowType === "Header") {
      const colIndex: Record<string, number> = {};
      for (let i = 2; i < fields.length; i++) {
        colIndex[fields[i]] = i;
      }
      sectionHeaders.set(section, colIndex);
      continue;
    }

    if (rowType !== "Data") continue;
    const colIndex = sectionHeaders.get(section);
    if (!colIndex) continue;

    // ── Trades ────────────────────────────────────────────────────────────────
    if (section === "Trades") {
      const assetCategory = fields[colIndex["Asset Category"] ?? -1] ?? "";

      // Forex (currency conversion) — capture as FX_IN/FX_OUT cash legs.
      if (assetCategory === "Forex") {
        for (const leg of parseCsvForexLegs(fields, colIndex)) {
          cashTxs.push(leg);
        }
        continue;
      }

      if (assetCategory !== "Stocks") continue;

      try {
        const symbol = fields[colIndex.Symbol ?? -1] ?? "";
        const currency = fields[colIndex.Currency ?? -1] ?? "";
        const conid = fields[colIndex.Conid ?? -1] ?? "";
        const listingExchange = fields[colIndex.ListingExchange ?? -1] ?? "";
        const rawDate = fields[colIndex["Date/Time"] ?? -1] ?? "";
        const rawQty = fields[colIndex.Quantity ?? -1] ?? "";
        const rawPrice = fields[colIndex["T. Price"] ?? -1] ?? "";
        const rawFee = fields[colIndex["Comm/Fee"] ?? -1] ?? "0";

        if (!symbol || !currency || !rawDate || !rawQty || !rawPrice) continue;

        const qty = Number.parseFloat(rawQty);
        if (Number.isNaN(qty) || qty === 0) continue;

        const price = Number.parseFloat(rawPrice);
        if (Number.isNaN(price) || price <= 0) continue;

        const date = parseIbkrDate(rawDate);
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
          externalRef: fingerprint(
            symbol,
            date.toISOString(),
            quantity,
            rawPrice,
          ),
        });
      } catch {
        // Skip unparseable rows
      }
      continue;
    }

    // ── Deposits & Withdrawals ─────────────────────────────────────────────────
    if (section === "Deposits & Withdrawals") {
      try {
        const currency = fields[colIndex.Currency ?? -1] ?? "";
        const rawDate = fields[colIndex["Settle Date"] ?? -1] ?? "";
        const description = fields[colIndex.Description ?? -1] ?? "";
        const rawAmount = fields[colIndex.Amount ?? -1] ?? "";

        if (!currency || !rawDate || !rawAmount) continue;

        const amount = Number.parseFloat(rawAmount);
        if (Number.isNaN(amount) || amount === 0) continue;

        const date = parseIbkrDate(rawDate);
        const type = amount > 0 ? "DEPOSIT" : "WITHDRAWAL";

        cashTxs.push({
          currency,
          date,
          amount: amount.toString(),
          type,
          description,
          externalRef: fingerprint(
            "cash",
            currency,
            date.toISOString(),
            rawAmount,
            description,
          ),
        });
      } catch {
        // Skip unparseable rows
      }
      continue;
    }

    // ── Dividends ──────────────────────────────────────────────────────────────
    if (section === "Dividends") {
      try {
        const currency = fields[colIndex.Currency ?? -1] ?? "";
        const rawDate = fields[colIndex.Date ?? -1] ?? "";
        const description = fields[colIndex.Description ?? -1] ?? "";
        const rawAmount = fields[colIndex.Amount ?? -1] ?? "";

        if (!currency || !rawDate || !rawAmount) continue;

        const amount = Number.parseFloat(rawAmount);
        if (Number.isNaN(amount) || amount === 0) continue;

        const date = parseIbkrDate(rawDate);

        cashTxs.push({
          currency,
          date,
          amount: amount.toString(),
          type: "DIVIDEND",
          description,
          externalRef: fingerprint(
            "div",
            currency,
            date.toISOString(),
            rawAmount,
            description,
          ),
        });
      } catch {
        // Skip unparseable rows
      }
      continue;
    }

    // ── Interest / Withholding Tax / Fees ──────────────────────────────────────
    // Signed amounts are preserved (fees/withholding are typically negative) so
    // the cash balance reconciles with IBKR.
    if (
      section === "Interest" ||
      section === "Withholding Tax" ||
      section === "Fees"
    ) {
      try {
        const currency = fields[colIndex.Currency ?? -1] ?? "";
        const rawDate =
          fields[colIndex.Date ?? -1] ??
          fields[colIndex["Date/Time"] ?? -1] ??
          "";
        const description = fields[colIndex.Description ?? -1] ?? "";
        const rawAmount = fields[colIndex.Amount ?? -1] ?? "";

        if (!currency || !rawDate || !rawAmount) continue;
        if (/^total/i.test(description)) continue; // skip subtotal rows

        const amount = Number.parseFloat(rawAmount);
        if (Number.isNaN(amount) || amount === 0) continue;

        const date = parseIbkrDate(rawDate);
        const type: ParsedCashTxType =
          section === "Interest"
            ? "INTEREST"
            : section === "Withholding Tax"
              ? "WITHHOLDING"
              : "FEE";

        cashTxs.push({
          currency,
          date,
          amount: amount.toString(),
          type,
          description,
          externalRef: fingerprint(
            type,
            currency,
            date.toISOString(),
            rawAmount,
            description,
          ),
        });
      } catch {
        // Skip unparseable rows
      }
    }
  }

  return { trades, cashTxs };
}

/** Build FX_IN/FX_OUT (+ FEE) legs from a Forex Trades row. */
function parseCsvForexLegs(
  fields: string[],
  colIndex: Record<string, number>,
): ParsedCashTx[] {
  const symbol = fields[colIndex.Symbol ?? -1] ?? "";
  const [baseCcy, symQuote] = symbol.split(".");
  const quoteCcy = fields[colIndex.Currency ?? -1] || symQuote;
  const rawDate = fields[colIndex["Date/Time"] ?? -1] ?? "";
  if (!baseCcy || !quoteCcy || !rawDate) return [];

  const qty = Number.parseFloat(fields[colIndex.Quantity ?? -1] ?? "");
  if (Number.isNaN(qty) || qty === 0) return [];

  let date: Date;
  try {
    date = parseIbkrDate(rawDate);
  } catch {
    return [];
  }

  let proceeds = Number.parseFloat(fields[colIndex.Proceeds ?? -1] ?? "");
  if (Number.isNaN(proceeds)) {
    const price = Number.parseFloat(fields[colIndex["T. Price"] ?? -1] ?? "");
    proceeds = Number.isNaN(price) ? 0 : -qty * price;
  }

  const idSeed = fingerprint("fx", symbol, date.toISOString(), `${qty}`);
  const legs: ParsedCashTx[] = [];
  legs.push({
    currency: baseCcy,
    date,
    amount: Math.abs(qty).toString(),
    type: qty > 0 ? "FX_IN" : "FX_OUT",
    description: `FX ${symbol}`,
    externalRef: `${idSeed}:BASE`,
  });
  if (proceeds !== 0) {
    legs.push({
      currency: quoteCcy,
      date,
      amount: Math.abs(proceeds).toString(),
      type: proceeds > 0 ? "FX_IN" : "FX_OUT",
      description: `FX ${symbol}`,
      externalRef: `${idSeed}:QUOTE`,
    });
  }
  const comm = Number.parseFloat(fields[colIndex["Comm/Fee"] ?? -1] ?? "");
  if (!Number.isNaN(comm) && comm !== 0) {
    legs.push({
      currency: quoteCcy,
      date,
      amount: comm.toString(),
      type: "FEE",
      description: `FX commission ${symbol}`,
      externalRef: `${idSeed}:COMM`,
    });
  }
  return legs;
}
