import ExcelJS from "exceljs";

export const SIMPLY_WALL_ST_HEADERS = [
  "Ticker or Symbol (recommended) / Company name",
  "Transaction Type (BUY or SELL)",
  "Date (YYYY/MM/DD)",
  "Units",
  "Price",
  "Currency (optional)",
] as const;

type DecimalLike = {
  toString(): string;
};

export type SimplyWallStTradeInput = {
  type: "BUY" | "SELL";
  date: Date;
  quantity: DecimalLike;
  price: DecimalLike;
  currency: string;
  instrument: {
    symbol: string;
    yahooSymbol: string;
    exchange: string;
    name: string;
  };
};

export type SimplyWallStExportRow = {
  tickerOrCompany: string;
  transactionType: "BUY" | "SELL";
  date: Date;
  units: number;
  price: number;
  currency: string;
};

const EXCHANGE_PREFIX_BY_YAHOO_EXCHANGE: Record<string, string> = {
  ASE: "NYSEAM",
  AMEX: "NYSEAM",
  ASX: "ASX",
  BATS: "BATS",
  BER: "DB",
  BRU: "ENXTBR",
  CPH: "CPSE",
  DEU: "DB",
  FRA: "DB",
  GER: "DB",
  HEL: "HLSE",
  HKG: "SEHK",
  JPX: "TSE",
  KOE: "KOSDAQ",
  KSC: "KOSE",
  LIS: "ENXTLIS",
  LSE: "LSE",
  MIL: "BIT",
  MUN: "DB",
  NCM: "NasdaqCM",
  NGM: "NasdaqGM",
  NMS: "NasdaqGS",
  NYQ: "NYSE",
  NYS: "NYSE",
  NYSE: "NYSE",
  OSL: "OB",
  PAR: "ENXTPA",
  PCX: "NYSEARCA",
  STO: "OM",
  STU: "DB",
  SWX: "SWX",
  TOR: "TSX",
  VAN: "TSXV",
};

const EXCHANGE_PREFIX_BY_YAHOO_SUFFIX: Record<string, string> = {
  AS: "ENXTAM",
  AX: "ASX",
  BR: "ENXTBR",
  CO: "CPSE",
  DE: "DB",
  F: "DB",
  HE: "HLSE",
  HK: "SEHK",
  KQ: "KOSDAQ",
  KS: "KOSE",
  L: "LSE",
  LS: "ENXTLIS",
  MI: "BIT",
  OL: "OB",
  PA: "ENXTPA",
  ST: "OM",
  SW: "SWX",
  T: "TSE",
  TO: "TSX",
  V: "TSXV",
};

export function getSimplyWallStTicker(input: {
  symbol: string;
  yahooSymbol: string;
  exchange: string;
  name: string;
}): string {
  const symbol = input.symbol.trim().toUpperCase();
  const name = input.name.trim();
  const exchange = input.exchange.trim().toUpperCase();
  const prefix = EXCHANGE_PREFIX_BY_YAHOO_EXCHANGE[exchange];

  if (prefix && symbol) {
    return `${prefix}:${symbol}`;
  }

  const yahooSymbol = input.yahooSymbol.trim().toUpperCase();
  const dotIdx = yahooSymbol.lastIndexOf(".");
  if (dotIdx > 0 && dotIdx < yahooSymbol.length - 1) {
    const suffix = yahooSymbol.slice(dotIdx + 1);
    const suffixPrefix = EXCHANGE_PREFIX_BY_YAHOO_SUFFIX[suffix];
    if (suffixPrefix && symbol) {
      return `${suffixPrefix}:${symbol}`;
    }
  }

  return name || symbol || yahooSymbol;
}

export function buildSimplyWallStExportRows(
  trades: SimplyWallStTradeInput[],
): SimplyWallStExportRow[] {
  return trades.map((trade) => ({
    tickerOrCompany: getSimplyWallStTicker(trade.instrument),
    transactionType: trade.type,
    date: trade.date,
    units: Number(trade.quantity.toString()),
    price: Number(trade.price.toString()),
    currency: trade.currency.toUpperCase(),
  }));
}

export async function createSimplyWallStWorkbook(
  rows: SimplyWallStExportRow[],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Portfolio Manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Sheet1", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.addRow([...SIMPLY_WALL_ST_HEADERS]);
  for (const row of rows) {
    sheet.addRow([
      row.tickerOrCompany,
      row.transactionType,
      row.date,
      row.units,
      row.price,
      row.currency,
    ]);
  }

  sheet.getRow(1).font = { bold: true };
  sheet.getColumn(1).width = 42;
  sheet.getColumn(2).width = 30;
  sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 12;
  sheet.getColumn(5).width = 12;
  sheet.getColumn(6).width = 20;
  sheet.getColumn(3).numFmt = "yyyy/mm/dd";
  sheet.getColumn(4).numFmt = "0.########";
  sheet.getColumn(5).numFmt = "0.########";

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: SIMPLY_WALL_ST_HEADERS.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  if (buffer instanceof ArrayBuffer) {
    return buffer;
  }

  const bytes = buffer as Uint8Array;
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export function sanitizeExportFilename(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "group";
}
