import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import pdf from "pdf-parse";

export type ParsedExternalCashTransaction = {
  date: Date;
  description: string;
  amount: string;
  type: "DEPOSIT" | "WITHDRAWAL" | "INTEREST";
  balance: string;
  externalRef: string;
};

export type ParsedExternalCashStatement = {
  provider: "COMMBANK" | "ING";
  accountLast4: string;
  sourceAccountKey: string;
  accountType: string | null;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  statementGeneratedAt: Date | null;
  endingBalance: string;
  transactions: ParsedExternalCashTransaction[];
  ignoredTransactionsCount?: number;
  reconcileEndingBalance?: boolean;
};

const COMMBANK_PROVIDER = "COMMBANK";
const ING_PROVIDER = "ING";
const DEFAULT_CURRENCY = "AUD";
const ING_ACCOUNT_TYPE = "ING HISA";
const ING_SOURCE_ACCOUNT_KEY = `${ING_PROVIDER}:HISA`;

export async function parseExternalCashStatementPdf(
  buffer: Buffer,
): Promise<ParsedExternalCashStatement> {
  const data = await pdf(buffer);
  return parseCommBankTransactionSummaryText(data.text);
}

export async function parseExternalCashStatementFile(
  buffer: Buffer,
  filename: string,
  contentType: string | null | undefined,
): Promise<ParsedExternalCashStatement> {
  const lowerName = filename.toLowerCase();
  const lowerType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (
    lowerName.endsWith(".csv") ||
    lowerType === "text/csv" ||
    lowerType === "application/csv" ||
    lowerType === "application/vnd.ms-excel"
  ) {
    return parseIngCashTransactionsCsv(buffer.toString("utf8"));
  }

  return parseExternalCashStatementPdf(buffer);
}

export function parseCommBankTransactionSummaryText(
  text: string,
): ParsedExternalCashStatement {
  const normalized = normalizeText(text);

  if (
    !/Transaction Summary/i.test(normalized) ||
    !/CommBank/i.test(normalized)
  ) {
    throw new Error("Only CommBank Transaction Summary PDFs are supported.");
  }

  const accountNumber =
    matchFirst(normalized, /Account number\s+([\d\s]+)/i) ??
    matchFirst(normalized, /Account Number\s+([\d\s]+)/i);
  if (!accountNumber) throw new Error("Could not find account number.");

  const accountDigits = accountNumber.replace(/\D/g, "");
  if (accountDigits.length < 4) {
    throw new Error("Could not read account number.");
  }

  const accountLast4 = accountDigits.slice(-4);
  const sourceAccountKey = `${COMMBANK_PROVIDER}:${accountDigits}`;

  const periodMatch = normalized.match(
    /transactions from\s+(\d{2}\/\d{2}\/\d{2})-(\d{2}\/\d{2}\/\d{2})/i,
  );
  if (!periodMatch?.[1] || !periodMatch?.[2]) {
    throw new Error("Could not find statement period.");
  }

  const statementGeneratedAt = parseCreatedAt(
    matchFirst(
      normalized,
      /Created\s+(\d{2}\/\d{2}\/\d{2}\s+\d{1,2}:\d{2}\s*(?:am|pm))/i,
    ),
  );

  const accountType =
    matchFirst(normalized, /Account type\s+([A-Za-z][A-Za-z0-9 -]*)/i) ?? null;

  const transactions = parseTransactionRows(normalized, sourceAccountKey);
  if (transactions.length === 0) {
    throw new Error("No statement transactions were found.");
  }

  const endingBalance = transactions[transactions.length - 1].balance;

  return {
    provider: COMMBANK_PROVIDER,
    accountLast4,
    sourceAccountKey,
    accountType,
    currency: DEFAULT_CURRENCY,
    periodStart: parseShortDate(periodMatch[1]),
    periodEnd: parseShortDate(periodMatch[2]),
    statementGeneratedAt,
    endingBalance,
    transactions,
  };
}

export function parseIngCashTransactionsCsv(
  text: string,
): ParsedExternalCashStatement {
  const csvRows = parseCsv(text.replace(/^\uFEFF/, ""));
  const [rawHeaders, ...rawDataRows] = csvRows;
  if (!rawHeaders) {
    throw new Error("ING CSV is empty.");
  }

  const headerIndex = new Map(
    rawHeaders.map((header, index) => [normalizeCsvHeader(header), index]),
  );
  const requiredHeaders = ["date", "description", "credit", "debit", "balance"];
  if (requiredHeaders.some((header) => !headerIndex.has(header))) {
    throw new Error(
      "Only ING transaction CSVs with Date, Description, Credit, Debit and Balance columns are supported.",
    );
  }

  const rows = rawDataRows
    .map((row, originalIndex) =>
      parseIngCsvRow(row, headerIndex, originalIndex),
    )
    .filter((row): row is IngCsvRow => row !== null);

  if (rows.length === 0) {
    throw new Error("No ING CSV transactions were found.");
  }

  let ignoredTransactionsCount = 0;
  const transactions: ParsedExternalCashTransaction[] = [];

  for (const row of rows) {
    if (/\btransfer\b/i.test(row.description)) {
      ignoredTransactionsCount += 1;
      continue;
    }

    const type: ParsedExternalCashTransaction["type"] =
      row.credit && /\binterest\b/i.test(row.description)
        ? "INTEREST"
        : row.amountSigned.isNegative()
          ? "WITHDRAWAL"
          : "DEPOSIT";

    transactions.push({
      date: row.date,
      description: row.description,
      amount: row.amountSigned.abs().toFixed(4),
      type,
      balance: row.balance.toFixed(4),
      externalRef: fingerprint(
        ING_PROVIDER,
        ING_SOURCE_ACCOUNT_KEY,
        row.date.toISOString(),
        row.description,
        row.amountSigned.toFixed(4),
        row.balance.toFixed(4),
      ),
    });
  }

  transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    provider: ING_PROVIDER,
    accountLast4: "HISA",
    sourceAccountKey: ING_SOURCE_ACCOUNT_KEY,
    accountType: ING_ACCOUNT_TYPE,
    currency: DEFAULT_CURRENCY,
    periodStart: minDate(rows.map((row) => row.date)),
    periodEnd: maxDate(rows.map((row) => row.date)),
    statementGeneratedAt: null,
    endingBalance: newestEndpointBalance(rows).toFixed(4),
    transactions,
    ignoredTransactionsCount,
    reconcileEndingBalance: false,
  };
}

function parseTransactionRows(
  text: string,
  sourceAccountKey: string,
): ParsedExternalCashTransaction[] {
  const rows: ParsedExternalCashTransaction[] = [];
  const moneyPattern = /-?\$[\d,]+\.\d{2}|\$-\d[\d,]*\.\d{2}/g;

  for (const rawRow of logicalTransactionRows(text)) {
    const rowMatch = rawRow.match(/^(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s+(.+)$/);
    if (!rowMatch?.[1] || !rowMatch?.[2]) continue;

    const rawDate = rowMatch[1];
    const body = rowMatch[2];
    const moneyMatches = Array.from(body.matchAll(moneyPattern));
    if (moneyMatches.length < 2) continue;

    const rawAmount = moneyMatches[moneyMatches.length - 2]?.[0];
    const rawBalance = moneyMatches[moneyMatches.length - 1]?.[0];
    if (!rawAmount || !rawBalance) continue;

    const amount = parseMoney(rawAmount);
    const balance = parseMoney(rawBalance);
    const date = parseLongDate(rawDate);
    const description = body
      .replace(moneyPattern, " ")
      .trim()
      .replace(/\s+/g, " ");

    // Detect interest entries by description before falling back to sign.
    // CommBank uses "Credit Interest" and "Bonus Interest"; catch any variant.
    const isInterest = /\binterest\b/i.test(description);
    const type: ParsedExternalCashTransaction["type"] = isInterest
      ? "INTEREST"
      : amount.isNegative()
        ? "WITHDRAWAL"
        : "DEPOSIT";

    rows.push({
      date,
      description,
      amount: amount.abs().toFixed(4),
      type,
      balance: balance.toFixed(4),
      externalRef: fingerprint(
        COMMBANK_PROVIDER,
        sourceAccountKey,
        date.toISOString(),
        description,
        amount.toFixed(4),
        balance.toFixed(4),
      ),
    });
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return rows;
}

type IngCsvRow = {
  date: Date;
  description: string;
  credit: Decimal | null;
  debit: Decimal | null;
  amountSigned: Decimal;
  balance: Decimal;
  originalIndex: number;
};

function parseIngCsvRow(
  row: string[],
  headerIndex: Map<string, number>,
  originalIndex: number,
): IngCsvRow | null {
  if (row.every((value) => !value.trim())) return null;

  const dateRaw = csvValue(row, headerIndex, "date");
  const description = csvValue(row, headerIndex, "description").replace(
    /\s+/g,
    " ",
  );
  const credit = parseOptionalCsvMoney(csvValue(row, headerIndex, "credit"));
  const debit = parseOptionalCsvMoney(csvValue(row, headerIndex, "debit"));
  const balance = parseRequiredCsvMoney(csvValue(row, headerIndex, "balance"));

  if (!dateRaw || !description) {
    throw new Error("ING CSV rows must include a date and description.");
  }
  if (credit !== null && debit !== null) {
    throw new Error(
      "ING CSV rows cannot include both credit and debit amounts.",
    );
  }
  let amountSigned: Decimal;
  if (credit !== null) {
    amountSigned = credit;
  } else if (debit !== null) {
    amountSigned = debit.negated();
  } else {
    throw new Error("ING CSV rows must include a credit or debit amount.");
  }

  return {
    date: parseSlashDate(dateRaw),
    description,
    credit,
    debit,
    amountSigned,
    balance,
    originalIndex,
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n") {
      row.push(field.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  row.push(field.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function normalizeCsvHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase();
}

function csvValue(
  row: string[],
  headerIndex: Map<string, number>,
  header: string,
): string {
  const index = headerIndex.get(header);
  return index === undefined ? "" : (row[index] ?? "").trim();
}

function parseOptionalCsvMoney(raw: string): Decimal | null {
  if (!raw.trim()) return null;
  return parseCsvMoney(raw);
}

function parseRequiredCsvMoney(raw: string): Decimal {
  if (!raw.trim()) throw new Error("ING CSV rows must include a balance.");
  return parseCsvMoney(raw);
}

function parseCsvMoney(raw: string): Decimal {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith("-") || /^\(.+\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[$,\s()+-]/g, "");
  const amount = new Decimal(cleaned);
  return negative ? amount.negated() : amount;
}

function logicalTransactionRows(text: string): string[] {
  const rows: string[] = [];
  let current: string[] = [];
  const datePrefix = /^\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/;

  for (const line of text.split("\n")) {
    if (datePrefix.test(line)) {
      if (current.length > 0) rows.push(current.join(" "));
      current = [line];
      continue;
    }

    if (current.length === 0) continue;

    const joined = current.join(" ");
    const moneyCount = Array.from(
      joined.matchAll(/-?\$[\d,]+\.\d{2}|\$-\d[\d,]*\.\d{2}/g),
    ).length;

    if (moneyCount < 2) {
      current.push(line);
    }
  }

  if (current.length > 0) rows.push(current.join(" "));
  return rows;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("\n");
}

function matchFirst(text: string, pattern: RegExp): string | null {
  return text.match(pattern)?.[1]?.trim() ?? null;
}

function parseMoney(raw: string): Decimal {
  const negative = raw.includes("-") || /^\(.+\)$/.test(raw.trim());
  const cleaned = raw.replace(/[$,\s()-]/g, "");
  const amount = new Decimal(cleaned);
  return negative ? amount.negated() : amount;
}

function parseShortDate(raw: string): Date {
  const [day, month, year] = raw.split("/").map((part) => Number(part));
  if (!day || !month || year === undefined) {
    throw new Error(`Invalid date: ${raw}`);
  }
  return utcDate(year < 100 ? 2000 + year : year, month, day);
}

function parseSlashDate(raw: string): Date {
  const [day, month, year] = raw.split("/").map((part) => Number(part));
  if (!day || !month || year === undefined || Number.isNaN(year)) {
    throw new Error(`Invalid date: ${raw}`);
  }
  return utcDate(year < 100 ? 2000 + year : year, month, day);
}

function parseLongDate(raw: string): Date {
  const match = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match?.[1] || !match?.[2] || !match?.[3]) {
    throw new Error(`Invalid transaction date: ${raw}`);
  }
  return utcDate(Number(match[3]), monthNumber(match[2]), Number(match[1]));
}

function minDate(dates: Date[]): Date {
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function maxDate(dates: Date[]): Date {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function newestEndpointBalance(rows: IngCsvRow[]): Decimal {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) throw new Error("No ING CSV transactions were found.");
  if (first.date.getTime() >= last.date.getTime()) return first.balance;
  return last.balance;
}

function parseCreatedAt(raw: string | null): Date | null {
  if (!raw) return null;
  const match = raw.match(
    /^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i,
  );
  if (!match?.[1] || !match?.[2] || !match?.[3] || !match?.[4] || !match?.[5]) {
    return null;
  }
  let hour = Number(match[4]);
  const meridiem = match[6]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return new Date(
    Date.UTC(
      2000 + Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      hour,
      Number(match[5]),
    ),
  );
}

function monthNumber(month: string): number {
  const full = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const abbr = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const key = month.toLowerCase();
  const index =
    full.indexOf(key) !== -1 ? full.indexOf(key) : abbr.indexOf(key);
  if (index === -1) throw new Error(`Invalid month: ${month}`);
  return index + 1;
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function fingerprint(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
