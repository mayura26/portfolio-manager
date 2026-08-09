import type Decimal from "decimal.js";

export type AutoWatcherMilestoneMessageInput = {
  symbol: string;
  pnlPct: Decimal;
  unrealizedPnL: Decimal | null;
  pnlCurrency: string;
  avgCost: Decimal;
  currentPrice: Decimal | null;
  instrumentCurrency: string;
};

export type AutoWatcherCrossingDirection = "upside" | "downside";

export function formatMoney(
  value: Decimal,
  currency: string,
  options: { signed?: boolean } = {},
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    signDisplay: options.signed ? "exceptZero" : "auto",
  }).format(value.toNumber());
}

export function formatAutoWatcherCrossingLabel(
  symbol: string,
  milestoneLabel: string,
  crossingDirection: AutoWatcherCrossingDirection,
): string {
  return `${symbol} crossed ${milestoneLabel} to the ${crossingDirection}`;
}

export function formatAutoWatcherPositionLabel(
  unrealizedPnL: Decimal | null,
  currency: string,
): string {
  if (!unrealizedPnL) return "position P&L unavailable";

  const result = unrealizedPnL.isNegative() ? "loss" : "gain";
  return `${formatMoney(unrealizedPnL, currency, { signed: true })} ${result}`;
}

export function formatAutoWatcherMilestoneMessage(
  input: AutoWatcherMilestoneMessageInput,
): string {
  const direction = input.pnlPct.isNegative() ? "down" : "up";
  const pnlText = `${direction} ${input.pnlPct.abs().toFixed(1)}%`;
  const positionText = formatAutoWatcherPositionLabel(
    input.unrealizedPnL,
    input.pnlCurrency,
  );
  const currentPrice = input.currentPrice
    ? formatMoney(input.currentPrice, input.instrumentCurrency)
    : "N/A";

  return `${input.symbol} is ${pnlText} vs cost basis. Position: ${positionText}. Avg cost ${formatMoney(input.avgCost, input.instrumentCurrency)}, current ${currentPrice}.`;
}
