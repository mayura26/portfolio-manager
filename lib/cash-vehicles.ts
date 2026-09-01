export type CashVehicleKind = "CASH" | "HISA";

export function classifyExternalCashAccountKind(
  accountType: string | null | undefined,
): CashVehicleKind {
  const normalized = accountType?.toLowerCase() ?? "";
  if (
    /\bhisa\b/.test(normalized) ||
    /\bsav(?:er|ings?)\b/.test(normalized) ||
    /\bgoal\s*saver\b/.test(normalized) ||
    /\bnetbank\s*saver\b/.test(normalized) ||
    /\bterm\s*deposit\b/.test(normalized)
  ) {
    return "HISA";
  }
  return "CASH";
}

export function cashVehicleLabel(
  kind: CashVehicleKind,
  accountType: string | null | undefined,
): string {
  if (kind === "HISA") {
    return accountType ? `${accountType} (HISA)` : "HISA";
  }
  return "Pure cash";
}
