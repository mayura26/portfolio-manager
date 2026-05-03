import { format, formatDistanceToNowStrict } from "date-fns";
import Decimal from "decimal.js";

type DecimalLike = Decimal | string | number | bigint | null | undefined;

function toDecimal(value: DecimalLike): Decimal | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Decimal) return value;
  if (typeof value === "bigint") return new Decimal(value.toString());
  return new Decimal(value);
}

export function formatCurrency(
  value: DecimalLike,
  currency: string,
  options: { compact?: boolean; signed?: boolean } = {},
): string {
  const decimal = toDecimal(value);
  if (decimal === null) return "—";

  const { compact = false, signed = false } = options;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
    minimumFractionDigits: compact ? 0 : 2,
    signDisplay: signed ? "exceptZero" : "auto",
  });

  return formatter.format(decimal.toNumber());
}

export function formatNumber(
  value: DecimalLike,
  options: { decimals?: number; compact?: boolean; signed?: boolean } = {},
): string {
  const decimal = toDecimal(value);
  if (decimal === null) return "—";

  const { decimals = 2, compact = false, signed = false } = options;
  const formatter = new Intl.NumberFormat("en-US", {
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: compact ? 0 : decimals,
    maximumFractionDigits: decimals,
    signDisplay: signed ? "exceptZero" : "auto",
  });

  return formatter.format(decimal.toNumber());
}

export function formatPercent(
  value: DecimalLike,
  options: { decimals?: number; signed?: boolean } = {},
): string {
  const decimal = toDecimal(value);
  if (decimal === null) return "—";

  const { decimals = 2, signed = true } = options;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: signed ? "exceptZero" : "auto",
  });

  return formatter.format(decimal.toNumber());
}

export function formatQuantity(value: DecimalLike): string {
  const decimal = toDecimal(value);
  if (decimal === null) return "—";

  const abs = decimal.abs();
  if (abs.gte(1000)) return formatNumber(decimal, { decimals: 2 });
  if (abs.gte(1)) return formatNumber(decimal, { decimals: 4 });
  return formatNumber(decimal, { decimals: 8 });
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return format(d, "d MMM yyyy");
}

export function formatDateTime(
  value: Date | string | null | undefined,
): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return format(d, "d MMM yyyy, HH:mm");
}

export function formatRelative(
  value: Date | string | null | undefined,
): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return `${formatDistanceToNowStrict(d)} ago`;
}

export function pnlClass(value: DecimalLike): string {
  const decimal = toDecimal(value);
  if (decimal === null || decimal.isZero()) return "text-muted";
  return decimal.isPositive() ? "text-gain" : "text-loss";
}
