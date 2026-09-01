import Decimal from "decimal.js";
import { computeBuyPlan } from "@/lib/buy-calculator";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { AllocationRow } from "@/lib/portfolio-allocation";

type Props = {
  row: {
    targetPercent: string;
    rebalanceTargetPercent: string;
    rangeStatus: "on-target" | "underweight" | "overweight";
    quantity: string;
    marketPrice: string | null;
    marketValueBase: string;
    intendedBuyPrice: string | null;
    intendedSellPrice: string | null;
    instrumentCurrency: string;
  };
  totalPortfolioValueBase: string;
  portfolioBaseCurrency: string;
  groupCashBase: string;
  groupBaseCurrency: string;
};

export function BuyPlanCell({
  row,
  totalPortfolioValueBase,
  portfolioBaseCurrency,
  groupCashBase,
  groupBaseCurrency,
}: Props) {
  const fakeRow = {
    targetPercent: new Decimal(row.targetPercent),
    rebalanceTargetPercent: new Decimal(row.rebalanceTargetPercent),
    marketValueBase: new Decimal(row.marketValueBase),
    intendedBuyPrice: row.intendedBuyPrice
      ? new Decimal(row.intendedBuyPrice)
      : null,
  } as Pick<
    AllocationRow,
    | "targetPercent"
    | "rebalanceTargetPercent"
    | "marketValueBase"
    | "intendedBuyPrice"
  >;
  const plan = computeBuyPlan(
    fakeRow as AllocationRow,
    new Decimal(totalPortfolioValueBase),
    new Decimal(groupCashBase),
  );

  if (row.rangeStatus === "on-target") {
    return <span className="text-xs text-muted">In range</span>;
  }

  if (plan.gapValueBase.lte(0)) {
    const trimPlan = computeTrimPlan(row, plan.gapValueBase.abs());

    if (trimPlan) {
      return (
        <span className="tabular text-xs text-overweight">
          Trim {formatTrimQuantity(trimPlan.quantity)} @{" "}
          {formatCurrency(trimPlan.price.toString(), row.instrumentCurrency)}
        </span>
      );
    }

    return (
      <span className="text-xs text-overweight">
        Trim{" "}
        {formatCurrency(
          plan.gapValueBase.abs().toString(),
          portfolioBaseCurrency,
        )}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5 text-xs">
      <span
        className={`tabular ${plan.cashSufficient ? "text-foreground" : "text-warning"}`}
      >
        Buy{" "}
        {formatCurrency(plan.gapValueBase.toString(), portfolioBaseCurrency)}
      </span>
      {plan.suggestedShares ? (
        <span className="tabular text-subtle">
          ≈ {formatNumber(plan.suggestedShares.toString(), { decimals: 2 })} sh
        </span>
      ) : (
        <span className="text-subtle">set intended price</span>
      )}
      {!plan.cashSufficient ? (
        <span className="text-warning">
          pure cash {formatCurrency(groupCashBase, groupBaseCurrency)}
        </span>
      ) : null}
    </div>
  );
}

function computeTrimPlan(
  row: Props["row"],
  trimValueBase: Decimal,
): { quantity: Decimal; price: Decimal } | null {
  const quantityHeld = new Decimal(row.quantity);
  const quotePrice = row.intendedSellPrice
    ? new Decimal(row.intendedSellPrice)
    : row.marketPrice
      ? new Decimal(row.marketPrice)
      : null;

  if (!quotePrice || quotePrice.lte(0) || quantityHeld.lte(0)) {
    return null;
  }

  let basePrice = quotePrice;
  if (row.marketPrice) {
    const marketPrice = new Decimal(row.marketPrice);
    const marketValueBase = new Decimal(row.marketValueBase);
    const marketValueLocal = quantityHeld.times(marketPrice);

    if (marketPrice.gt(0) && marketValueBase.gt(0) && marketValueLocal.gt(0)) {
      const inferredFx = marketValueBase.dividedBy(marketValueLocal);
      basePrice = quotePrice.times(inferredFx);
    }
  }

  if (basePrice.lte(0)) return null;

  const quantity = Decimal.min(
    quantityHeld,
    trimValueBase.dividedBy(basePrice),
  );
  return { quantity, price: quotePrice };
}

function formatTrimQuantity(quantity: Decimal) {
  const abs = quantity.abs();
  if (abs.gte(1000)) return formatNumber(quantity, { decimals: 0 });
  if (abs.gte(1)) return formatNumber(quantity, { decimals: 2 });
  return formatNumber(quantity, { decimals: 4 });
}
