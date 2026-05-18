import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  buildSimplyWallStExportRows,
  createSimplyWallStWorkbook,
  getSimplyWallStTicker,
  SIMPLY_WALL_ST_HEADERS,
} from "@/lib/simply-wall-st-export";

const rows = buildSimplyWallStExportRows([
  {
    type: "BUY",
    date: new Date("2024-03-15T00:00:00.000Z"),
    quantity: { toString: () => "10.5" },
    price: { toString: () => "158.32" },
    currency: "usd",
    instrument: {
      symbol: "AAPL",
      yahooSymbol: "AAPL",
      exchange: "NMS",
      name: "Apple Inc.",
    },
  },
  {
    type: "SELL",
    date: new Date("2024-06-01T00:00:00.000Z"),
    quantity: { toString: () => "2.9" },
    price: { toString: () => "231.56" },
    currency: "USD",
    instrument: {
      symbol: "MSFT",
      yahooSymbol: "MSFT",
      exchange: "NMS",
      name: "Microsoft Corporation",
    },
  },
]);

assert.deepEqual(
  [...SIMPLY_WALL_ST_HEADERS],
  [
    "Ticker or Symbol (recommended) / Company name",
    "Transaction Type (BUY or SELL)",
    "Date (YYYY/MM/DD)",
    "Units",
    "Price",
    "Currency (optional)",
  ],
);

assert.equal(rows.length, 2);
assert.deepEqual(
  rows.map((row) => ({
    tickerOrCompany: row.tickerOrCompany,
    transactionType: row.transactionType,
    units: row.units,
    price: row.price,
    currency: row.currency,
  })),
  [
    {
      tickerOrCompany: "NasdaqGS:AAPL",
      transactionType: "BUY",
      units: 10.5,
      price: 158.32,
      currency: "USD",
    },
    {
      tickerOrCompany: "NasdaqGS:MSFT",
      transactionType: "SELL",
      units: 2.9,
      price: 231.56,
      currency: "USD",
    },
  ],
);

assert.equal(
  getSimplyWallStTicker({
    symbol: "SHOP",
    yahooSymbol: "SHOP.TO",
    exchange: "",
    name: "Shopify Inc.",
  }),
  "TSX:SHOP",
);

assert.equal(
  getSimplyWallStTicker({
    symbol: "UNKNOWN",
    yahooSymbol: "UNKNOWN",
    exchange: "MYSTERY",
    name: "Unknown Listed Co.",
  }),
  "Unknown Listed Co.",
);

async function main() {
  const workbookBuffer = await createSimplyWallStWorkbook(rows);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(workbookBuffer);
  const sheet = workbook.getWorksheet("Sheet1");

  assert.ok(sheet, "Expected Sheet1 in exported workbook");
  assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1), [
    ...SIMPLY_WALL_ST_HEADERS,
  ]);
  assert.equal(sheet.getCell("A2").value, "NasdaqGS:AAPL");
  assert.equal(sheet.getCell("B2").value, "BUY");
  assert.equal(sheet.getCell("D2").value, 10.5);
  assert.equal(sheet.getCell("E2").value, 158.32);
  assert.equal(sheet.getCell("F2").value, "USD");
  assert.equal(sheet.getColumn(3).numFmt, "yyyy/mm/dd");

  console.log("Simply Wall St export tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
