import Decimal from "decimal.js";
import type { AllocationRow } from "@/lib/portfolio-allocation";

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

export type BuyPlan = {
  // Nearest in-range target value at the current portfolio total.
  targetValueBase: Decimal;
  currentValueBase: Decimal;
  // gap = targetValue - currentValue. Positive = buy more; negative = overweight.
  gapValueBase: Decimal;
  intendedBuyPrice: Decimal | null;
  suggestedShares: Decimal | null;
  cashSufficient: boolean;
  groupCashBase: Decimal;
};

/**
 * Compute a rough buy plan for a single allocation row.
 *
 * Uses the *current* portfolio total as the denominator — a buy increases the
 * denominator slightly so this is a conservative ballpark, not a precise solve.
 * That matches the user's request for "roughly how much do I need to buy".
 */
export function computeBuyPlan(
  row: AllocationRow,
  totalPortfolioValueBase: Decimal,
  groupCashBase: Decimal,
): BuyPlan {
  const targetPercent = row.rebalanceTargetPercent ?? row.targetPercent;
  const targetValueBase = targetPercent
    .dividedBy(HUNDRED)
    .times(totalPortfolioValueBase);
  const gapValueBase = targetValueBase.minus(row.marketValueBase);
  const suggestedShares =
    row.intendedBuyPrice?.gt(0) && gapValueBase.gt(0)
      ? gapValueBase.dividedBy(row.intendedBuyPrice)
      : null;
  const cashSufficient =
    gapValueBase.lte(ZERO) || groupCashBase.gte(gapValueBase);

  return {
    targetValueBase,
    currentValueBase: row.marketValueBase,
    gapValueBase,
    intendedBuyPrice: row.intendedBuyPrice,
    suggestedShares,
    cashSufficient,
    groupCashBase,
  };
}
