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
  // Handles "YYYY-MM-DD, HH:MM:SS" and "YYYY-MM-DD; HH:MM:SS"
  const cleaned = raw.replace(/[,;]\s*/, "T").replace(/\s+/g, "");
  const d = new Date(cleaned);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${raw}`);
  return d;
}

export function parseIbkrCsv(raw: string): ParsedTrade[] {
  const lines = raw.split(/\r?\n/);

  // Find the Trades header row to build a column index map
  let colIndex: Record<string, number> | null = null;
  const trades: ParsedTrade[] = [];

  for (const line of lines) {
    if (!line.startsWith("Trades,")) continue;

    const fields = parseRow(line);
    const sectionType = fields[0];
    const rowType = fields[1];

    if (sectionType !== "Trades") continue;

    if (rowType === "Header") {
      // The header row defines column positions; reset when we see a new one
      colIndex = {};
      for (let i = 2; i < fields.length; i++) {
        colIndex[fields[i]] = i;
      }
      continue;
    }

    if (rowType !== "Data" || !colIndex) continue;

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
      const fees = Math.max(0, Math.abs(Number.parseFloat(rawFee) || 0)).toString();

      const externalRef = createHash("sha256")
        .update(`${symbol}|${date.toISOString()}|${quantity}|${price}`)
        .digest("hex");

      trades.push({
        symbol,
        currency,
        date,
        quantity,
        type,
        price: price.toString(),
        fees,
        externalRef,
      });
    } catch {
      // Skip unparseable rows silently
    }
  }

  return trades;
}
