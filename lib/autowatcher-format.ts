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

export function formatAutoWatcherMilestoneMessage(
  input: AutoWatcherMilestoneMessageInput,
): string {
  const direction = input.pnlPct.isNegative() ? "down" : "up";
  const pnlText = `${direction} ${input.pnlPct.abs().toFixed(1)}%`;
  const absoluteMove = input.unrealizedPnL
    ? `an unrealized ${input.unrealizedPnL.isNegative() ? "loss" : "gain"} of ${formatMoney(input.unrealizedPnL.abs(), input.pnlCurrency)}`
    : "unrealized P&L unavailable";
  const currentPrice = input.currentPrice
    ? formatMoney(input.currentPrice, input.instrumentCurrency)
    : "N/A";

  return `${input.symbol} is ${pnlText} vs cost basis, ${absoluteMove}. Avg cost ${formatMoney(input.avgCost, input.instrumentCurrency)}, current ${currentPrice}.`;
}
