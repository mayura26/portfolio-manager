/**
 * Debug helper: parse a manually-downloaded Flex XML file and show what
 * would be imported, without making any API calls or DB writes.
 *
 *   tsx scripts/debug-flex-xml.ts <path-to-xml>
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import type { ParsedCashTx, ParsedTrade } from "@/lib/import/ibkr-csv";

const path = process.argv[2];
if (!path) {
  console.error("Usage: tsx scripts/debug-flex-xml.ts <path-to-xml>");
  process.exit(1);
}

const xml = readFileSync(path, "utf-8");

function extractAttr(element: string, attr: string): string {
  const match = element.match(new RegExp(`${attr}="([^"]*)"`));
  return match ? match[1] : "";
}

function parseFlexDate(raw: string): Date {
  const [datePart, timePart = "000000"] = raw.split(";");
  const year = datePart.slice(0, 4);
  const month = datePart.slice(4, 6);
  const day = datePart.slice(6, 8);
  const hh = timePart.slice(0, 2);
  const mm = timePart.slice(2, 4);
  const ss = timePart.slice(4, 6);
  return new Date(`${year}-${month}-${day}T${hh}:${mm}:${ss}`);
}

const trades: ParsedTrade[] = [];
const tradeElements = xml.match(/<Trade\s[^>]*\/>/g) ?? [];

// Tally every Trade by assetCategory, and capture the non-STK (e.g. forex
// CASH) elements verbatim so we can see how currency conversions are reported.
const assetCategoryTally = new Map<string, number>();
const nonStkTrades: string[] = [];
for (const el of tradeElements) {
  const cat = extractAttr(el, "assetCategory") || "(none)";
  assetCategoryTally.set(cat, (assetCategoryTally.get(cat) ?? 0) + 1);
  if (cat !== "STK") nonStkTrades.push(el);
}

for (const el of tradeElements) {
  if (extractAttr(el, "assetCategory") !== "STK") continue;
  const symbol = extractAttr(el, "symbol");
  const currency = extractAttr(el, "currency");
  const conid = extractAttr(el, "conid") || extractAttr(el, "Conid");
  const listingExchange =
    extractAttr(el, "listingExchange") || extractAttr(el, "ListingExchange");
  const rawDate = extractAttr(el, "dateTime");
  const rawQty = extractAttr(el, "quantity");
  const rawPrice = extractAttr(el, "tradePrice");
  const rawFee = extractAttr(el, "ibCommission");
  const tradeId = extractAttr(el, "tradeID");
  const qty = Number.parseFloat(rawQty);
  const price = Number.parseFloat(rawPrice);
  const date = parseFlexDate(rawDate);
  trades.push({
    symbol,
    currency,
    conid: conid || undefined,
    listingExchange: listingExchange || undefined,
    date,
    quantity: Math.abs(qty).toString(),
    type: qty > 0 ? "BUY" : "SELL",
    price: price.toString(),
    fees: Math.abs(Number.parseFloat(rawFee) || 0).toString(),
    externalRef: tradeId,
  });
}

const cashTxs: (ParsedCashTx & { rawType: string })[] = [];
const cashElements = xml.match(/<CashTransaction\s[^>]*\/>/g) ?? [];

// Tally every CashTransaction by its raw IBKR `type` so we can see what is
// dropped (Interest, Withholding Tax, Fees, …) vs imported.
const cashTypeTally = new Map<string, number>();
for (const el of cashElements) {
  const t = extractAttr(el, "type") || "(none)";
  cashTypeTally.set(t, (cashTypeTally.get(t) ?? 0) + 1);
}

for (const el of cashElements) {
  const txType = extractAttr(el, "type");
  let mappedType: ParsedCashTx["type"] | null = null;
  if (txType === "Deposits/Withdrawals") mappedType = null;
  else if (txType === "Dividends") mappedType = "DIVIDEND";
  else {
    cashTxs.push({
      currency: extractAttr(el, "currency"),
      date: parseFlexDate(extractAttr(el, "dateTime")),
      amount: extractAttr(el, "amount"),
      type: "DEPOSIT",
      description: extractAttr(el, "description"),
      externalRef: extractAttr(el, "transactionID"),
      rawType: `[SKIPPED] ${txType}`,
    });
    continue;
  }
  const amount = Number.parseFloat(extractAttr(el, "amount"));
  const finalType: ParsedCashTx["type"] =
    mappedType ?? (amount > 0 ? "DEPOSIT" : "WITHDRAWAL");
  cashTxs.push({
    currency: extractAttr(el, "currency"),
    date: parseFlexDate(extractAttr(el, "dateTime")),
    amount: amount.toString(),
    type: finalType,
    description: extractAttr(el, "description"),
    externalRef: extractAttr(el, "transactionID"),
    rawType: txType,
  });
}

console.log(`\n=== TRADES (${trades.length}) ===`);
for (const t of trades) {
  console.log(
    `  ${t.type.padEnd(4)} ${t.symbol.padEnd(10)} ${t.listingExchange ?? ""} ${t.conid ?? ""} qty=${t.quantity} @ ${t.price} ${t.currency}  ${t.date.toISOString().slice(0, 10)}`,
  );
}

console.log(`\n=== CASH TRANSACTIONS (${cashTxs.length}) ===`);
for (const c of cashTxs) {
  const action = c.rawType.startsWith("[SKIPPED]") ? c.rawType : c.type;
  console.log(
    `  ${action.padEnd(20)} ${c.amount.padStart(12)} ${c.currency}  ${c.date.toISOString().slice(0, 10)}  rawType="${c.rawType}"`,
  );
}

console.log(`\n=== TRADE assetCategory TALLY ===`);
for (const [cat, n] of [...assetCategoryTally].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat.padEnd(12)} ${n}`);
}

console.log(`\n=== NON-STK TRADES (forex / other) — raw elements ===`);
if (nonStkTrades.length === 0) {
  console.log("  (none)");
} else {
  for (const el of nonStkTrades) {
    console.log(
      `  cat=${extractAttr(el, "assetCategory")} symbol=${extractAttr(el, "symbol")} ` +
        `qty=${extractAttr(el, "quantity")} price=${extractAttr(el, "tradePrice")} ` +
        `proceeds=${extractAttr(el, "proceeds")} comm=${extractAttr(el, "ibCommission")} ` +
        `ccy=${extractAttr(el, "currency")} date=${extractAttr(el, "dateTime")}`,
    );
    console.log(`    ${el}`);
  }
}

console.log(`\n=== CASH TRANSACTION type TALLY (raw IBKR types) ===`);
for (const [t, n] of [...cashTypeTally].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t.padEnd(24)} ${n}`);
}

const wouldImport = cashTxs.filter((c) => !c.rawType.startsWith("[SKIPPED]"));
console.log(`\n=== SUMMARY ===`);
console.log(`Trades to import: ${trades.length}`);
console.log(`Cash to import:   ${wouldImport.length}`);
console.log(
  `Cash skipped (Interest/Fees/etc): ${cashTxs.length - wouldImport.length}`,
);
