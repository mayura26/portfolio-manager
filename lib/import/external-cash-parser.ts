import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import pdf from "pdf-parse";

export type ParsedExternalCashTransaction = {
  date: Date;
  description: string;
  amount: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  balance: string;
  externalRef: string;
};

export type ParsedExternalCashStatement = {
  provider: "COMMBANK";
  accountLast4: string;
  sourceAccountKey: string;
  accountType: string | null;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  statementGeneratedAt: Date | null;
  endingBalance: string;
  transactions: ParsedExternalCashTransaction[];
};

const PROVIDER = "COMMBANK";
const DEFAULT_CURRENCY = "AUD";

export async function parseExternalCashStatementPdf(
  buffer: Buffer,
): Promise<ParsedExternalCashStatement> {
  const data = await pdf(buffer);
  return parseCommBankTransactionSummaryText(data.text);
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
  const sourceAccountKey = `${PROVIDER}:${accountDigits}`;

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
    provider: PROVIDER,
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

function parseTransactionRows(
  text: string,
  sourceAccountKey: string,
): ParsedExternalCashTransaction[] {
  const rows: ParsedExternalCashTransaction[] = [];
  const transactionPattern =
    /^(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s+(.+?)\s+(-?\$[\d,]+\.\d{2}|\$-\d[\d,]*\.\d{2})\s+(-?\$[\d,]+\.\d{2}|\$-\d[\d,]*\.\d{2})$/gm;

  for (const match of text.matchAll(transactionPattern)) {
    const [, rawDate, rawDescription, rawAmount, rawBalance] = match;
    if (!rawDate || !rawDescription || !rawAmount || !rawBalance) continue;

    const amount = parseMoney(rawAmount);
    const balance = parseMoney(rawBalance);
    const date = parseLongDate(rawDate);
    const description = rawDescription.trim().replace(/\s+/g, " ");

    rows.push({
      date,
      description,
      amount: amount.abs().toFixed(4),
      type: amount.isNegative() ? "WITHDRAWAL" : "DEPOSIT",
      balance: balance.toFixed(4),
      externalRef: fingerprint(
        PROVIDER,
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

function parseLongDate(raw: string): Date {
  const match = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match?.[1] || !match?.[2] || !match?.[3]) {
    throw new Error(`Invalid transaction date: ${raw}`);
  }
  return utcDate(Number(match[3]), monthNumber(match[2]), Number(match[1]));
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
  const index = [
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
  ].indexOf(month.toLowerCase());
  if (index === -1) throw new Error(`Invalid month: ${month}`);
  return index + 1;
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function fingerprint(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
