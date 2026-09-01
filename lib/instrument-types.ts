export const INSTRUMENT_TYPE_OPTIONS = [
  "EQUITY",
  "INCOME_EQUITY",
  "ETF",
  "INCOME_ETF",
  "BOND",
  "BOND_ETF",
  "MUTUALFUND",
  "INDEX",
  "CRYPTOCURRENCY",
  "CURRENCY",
  "FUTURE",
  "OPTION",
  "OTHER",
] as const;

export type InstrumentTypeOption = (typeof INSTRUMENT_TYPE_OPTIONS)[number];

export const INSTRUMENT_TYPE_LABELS: Record<InstrumentTypeOption, string> = {
  EQUITY: "Equity",
  INCOME_EQUITY: "Income equity",
  ETF: "ETF / fund",
  INCOME_ETF: "Income ETF / fund",
  BOND: "Bond / fixed income",
  BOND_ETF: "Bond ETF / fund",
  MUTUALFUND: "Mutual fund",
  INDEX: "Index",
  CRYPTOCURRENCY: "Crypto",
  CURRENCY: "Currency",
  FUTURE: "Future",
  OPTION: "Option",
  OTHER: "Other",
};

export function isInstrumentTypeOption(
  value: string,
): value is InstrumentTypeOption {
  return INSTRUMENT_TYPE_OPTIONS.includes(value as InstrumentTypeOption);
}

export function instrumentTypeLabel(type: string): string {
  return isInstrumentTypeOption(type)
    ? INSTRUMENT_TYPE_LABELS[type]
    : type.replace(/_/g, " ");
}

export function assetClassForInstrumentType(type: string): string {
  const normalized = type.toUpperCase();
  if (normalized === "INCOME_EQUITY") return "Income equity";
  if (
    normalized === "BOND" ||
    normalized === "BOND_ETF" ||
    normalized.includes("BOND") ||
    normalized.includes("FIXED")
  ) {
    return "Bonds / fixed income";
  }
  if (normalized === "INCOME_ETF" || normalized.includes("INCOME")) {
    return "Income funds";
  }
  if (normalized === "CRYPTOCURRENCY") return "Crypto";
  if (normalized === "CURRENCY") return "Cash / currency";
  if (normalized === "FUTURE" || normalized === "OPTION") return "Derivatives";
  if (normalized === "INDEX") return "Index";
  if (normalized === "OTHER") return "Other";
  return "Equity";
}
