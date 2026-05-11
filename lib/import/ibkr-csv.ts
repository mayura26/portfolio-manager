import { createHash } from "node:crypto";

export type ParsedTrade = {
  symbol: string;
  currency: string;
  date: Date;
  quantity: string;
  type: "BUY" | "SELL";
  price: string;
  fees: string;
  externalRef: string;
};

export type ParsedCashTx = {
  currency: string;
  date: Date;
  amount: string;
  type: "DEPOSIT" | "WITHDRAWAL" | "DIVIDEND";
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
      if (assetCategory !== "Stocks") continue;

      try {
        const symbol = fields[colIndex["Symbol"] ?? -1] ?? "";
        const currency = fields[colIndex["Currency"] ?? -1] ?? "";
        const rawDate = fields[colIndex["Date/Time"] ?? -1] ?? "";
        const rawQty = fields[colIndex["Quantity"] ?? -1] ?? "";
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
          date,
          quantity,
          type,
          price: price.toString(),
          fees,
          externalRef: fingerprint(symbol, date.toISOString(), quantity, rawPrice),
        });
      } catch {
        // Skip unparseable rows
      }
      continue;
    }

    // ── Deposits & Withdrawals ─────────────────────────────────────────────────
    if (section === "Deposits & Withdrawals") {
      try {
        const currency = fields[colIndex["Currency"] ?? -1] ?? "";
        const rawDate = fields[colIndex["Settle Date"] ?? -1] ?? "";
        const description = fields[colIndex["Description"] ?? -1] ?? "";
        const rawAmount = fields[colIndex["Amount"] ?? -1] ?? "";

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
        const currency = fields[colIndex["Currency"] ?? -1] ?? "";
        const rawDate = fields[colIndex["Date"] ?? -1] ?? "";
        const description = fields[colIndex["Description"] ?? -1] ?? "";
        const rawAmount = fields[colIndex["Amount"] ?? -1] ?? "";

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
    }
  }

  return { trades, cashTxs };
}
