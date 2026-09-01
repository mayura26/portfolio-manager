import assert from "node:assert/strict";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import {
  buildSimplyWallStExportRows,
  createSimplyWallStWorkbook,
  getSimplyWallStTicker,
  SIMPLY_WALL_ST_HEADERS,
} from "@/lib/simply-wall-st-export";

type ParsedNode = Record<string, unknown>;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

function asNode(value: unknown): ParsedNode {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return value as ParsedNode;
}

function asArray(value: unknown): ParsedNode[] {
  if (Array.isArray(value)) {
    return value.map(asNode);
  }

  return [asNode(value)];
}

function getCellValue(cell: ParsedNode): unknown {
  const inlineString = cell.is;
  if (inlineString) {
    const text = asNode(inlineString).t;
    return typeof text === "object" && text !== null
      ? asNode(text)["#text"]
      : text;
  }

  return cell.v;
}

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
  const workbookZip = await JSZip.loadAsync(workbookBuffer);
  const worksheetFile = workbookZip.file("xl/worksheets/sheet1.xml");
  const stylesFile = workbookZip.file("xl/styles.xml");

  assert.ok(worksheetFile, "Expected Sheet1 in exported workbook");
  assert.ok(stylesFile, "Expected workbook styles");

  const worksheetXml = await worksheetFile.async("text");
  const stylesXml = await stylesFile.async("text");
  const worksheet = asNode(xmlParser.parse(worksheetXml).worksheet);
  const styles = asNode(xmlParser.parse(stylesXml).styleSheet);
  const sheetData = asNode(worksheet.sheetData);
  const sheetRows = asArray(sheetData.row);
  const headerCells = asArray(sheetRows[0].c);
  const firstTradeCells = asArray(sheetRows[1].c);

  assert.deepEqual(headerCells.map(getCellValue), [...SIMPLY_WALL_ST_HEADERS]);
  assert.equal(getCellValue(firstTradeCells[0]), "NasdaqGS:AAPL");
  assert.equal(getCellValue(firstTradeCells[1]), "BUY");
  assert.equal(getCellValue(firstTradeCells[3]), 10.5);
  assert.equal(getCellValue(firstTradeCells[4]), 158.32);
  assert.equal(getCellValue(firstTradeCells[5]), "USD");
  assert.equal(firstTradeCells[2].s, "2");
  assert.equal(asNode(worksheet.autoFilter).ref, "A1:F3");

  const numberFormats = asArray(asNode(styles.numFmts).numFmt);
  assert.ok(
    numberFormats.some((format) => format.formatCode === "yyyy/mm/dd"),
    "Expected date number format",
  );

  console.log("Simply Wall St export tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
