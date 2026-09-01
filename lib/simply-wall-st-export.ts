import JSZip from "jszip";

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

const SPREADSHEET_NS =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIP_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIP_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES_NS =
  "http://schemas.openxmlformats.org/package/2006/content-types";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXmlAttr(value: string): string {
  return escapeXmlText(value).replace(/"/g, "&quot;");
}

function columnName(index: number): string {
  let name = "";
  let current = index;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }

  return name;
}

function cellRef(column: number, row: number): string {
  return `${columnName(column)}${row}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot export non-finite numeric values to XLSX.");
  }

  return String(value);
}

function excelDateSerial(date: Date): string {
  const utcMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return String(utcMidnight / MS_PER_DAY + 25569);
}

function stringCell(
  reference: string,
  value: string,
  styleId?: number,
): string {
  const style = styleId === undefined ? "" : ` s="${styleId}"`;
  return `<c r="${reference}" t="inlineStr"${style}><is><t>${escapeXmlText(
    value,
  )}</t></is></c>`;
}

function numberCell(
  reference: string,
  value: string,
  styleId?: number,
): string {
  const style = styleId === undefined ? "" : ` s="${styleId}"`;
  return `<c r="${reference}"${style}><v>${value}</v></c>`;
}

function buildContentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="${CONTENT_TYPES_NS}">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

function buildPackageRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PACKAGE_RELATIONSHIP_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildWorkbookXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${SPREADSHEET_NS}" xmlns:r="${RELATIONSHIP_NS}">
  <fileVersion appName="xl"/>
  <workbookPr date1904="0"/>
  <bookViews>
    <workbookView xWindow="0" yWindow="0" windowWidth="12000" windowHeight="24000"/>
  </bookViews>
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
  <calcPr calcId="0"/>
</workbook>`;
}

function buildWorkbookRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PACKAGE_RELATIONSHIP_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${SPREADSHEET_NS}">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="yyyy/mm/dd"/>
    <numFmt numFmtId="165" formatCode="0.########"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function buildAppPropertiesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Portfolio Manager</Application>
</Properties>`;
}

function buildCorePropertiesXml(created: Date): string {
  const createdAt = escapeXmlText(created.toISOString());
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Portfolio Manager</dc:creator>
  <cp:lastModifiedBy>Portfolio Manager</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified>
</cp:coreProperties>`;
}

function buildWorksheetXml(rows: SimplyWallStExportRow[]): string {
  const headerCells = SIMPLY_WALL_ST_HEADERS.map((header, index) =>
    stringCell(cellRef(index + 1, 1), header, 1),
  ).join("");

  const dataRows = rows
    .map((row, index) => {
      const rowIndex = index + 2;
      return `<row r="${rowIndex}">${[
        stringCell(cellRef(1, rowIndex), row.tickerOrCompany),
        stringCell(cellRef(2, rowIndex), row.transactionType),
        numberCell(cellRef(3, rowIndex), excelDateSerial(row.date), 2),
        numberCell(cellRef(4, rowIndex), formatNumber(row.units), 3),
        numberCell(cellRef(5, rowIndex), formatNumber(row.price), 3),
        stringCell(cellRef(6, rowIndex), row.currency),
      ].join("")}</row>`;
    })
    .join("");

  const lastRow = Math.max(rows.length + 1, 1);
  const dimension = `A1:F${lastRow}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${SPREADSHEET_NS}" xmlns:r="${RELATIONSHIP_NS}">
  <dimension ref="${dimension}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="42" customWidth="1"/>
    <col min="2" max="2" width="30" customWidth="1"/>
    <col min="3" max="3" width="18" customWidth="1" style="2"/>
    <col min="4" max="4" width="12" customWidth="1" style="3"/>
    <col min="5" max="5" width="12" customWidth="1" style="3"/>
    <col min="6" max="6" width="20" customWidth="1"/>
  </cols>
  <sheetData>
    <row r="1">${headerCells}</row>${dataRows}
  </sheetData>
  <autoFilter ref="${escapeXmlAttr(dimension)}"/>
</worksheet>`;
}

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
  const zip = new JSZip();
  const created = new Date();

  zip.file("[Content_Types].xml", buildContentTypesXml());
  zip.folder("_rels")?.file(".rels", buildPackageRelationshipsXml());
  zip.folder("docProps")?.file("app.xml", buildAppPropertiesXml());
  zip.folder("docProps")?.file("core.xml", buildCorePropertiesXml(created));

  const xl = zip.folder("xl");
  xl?.file("workbook.xml", buildWorkbookXml());
  xl?.file("styles.xml", buildStylesXml());
  xl?.folder("_rels")?.file(
    "workbook.xml.rels",
    buildWorkbookRelationshipsXml(),
  );
  xl?.folder("worksheets")?.file("sheet1.xml", buildWorksheetXml(rows));

  return zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function sanitizeExportFilename(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "group";
}
