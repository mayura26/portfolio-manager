import Decimal from "decimal.js";
import { computeBuyPlan } from "@/lib/buy-calculator";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { AllocationRow } from "@/lib/portfolio-allocation";

type Props = {
  row: {
    targetPercent: string;
    marketValueBase: string;
    intendedBuyPrice: string | null;
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
    marketValueBase: new Decimal(row.marketValueBase),
    intendedBuyPrice: row.intendedBuyPrice
      ? new Decimal(row.intendedBuyPrice)
      : null,
  } as Pick<
    AllocationRow,
    "targetPercent" | "marketValueBase" | "intendedBuyPrice"
  >;
  const plan = computeBuyPlan(
    fakeRow as AllocationRow,
    new Decimal(totalPortfolioValueBase),
    new Decimal(groupCashBase),
  );

  if (plan.gapValueBase.lte(0)) {
    return (
      <span className="text-xs text-muted">
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
          group cash {formatCurrency(groupCashBase, groupBaseCurrency)}
        </span>
      ) : null}
    </div>
  );
}
