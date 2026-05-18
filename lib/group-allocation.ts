import Decimal from "decimal.js";
import {
  type AllocationRangeStatus,
  computeRangeDrift,
  midpointPercent,
} from "@/lib/allocation-range";
import { computeGroupCash } from "@/lib/cash";
import { db } from "@/lib/db";
import { convert } from "@/lib/fx";
import { computeHoldings } from "@/lib/holdings";

const ZERO = new Decimal(0);

export type GroupPortfolioRow = {
  kind: "portfolio";
  portfolioId: string;
  name: string;
  baseCurrency: string;
  targetPercent: Decimal;
  targetMinPercent: Decimal;
  targetMaxPercent: Decimal;
  actualValueBase: Decimal;
  actualPercent: Decimal;
  driftPercent: Decimal;
  rangeStatus: AllocationRangeStatus;
  rebalanceTargetPercent: Decimal;
};

export type GroupCashRow = {
  kind: "cash";
  targetPercent: Decimal;
  targetMinPercent: Decimal;
  targetMaxPercent: Decimal;
  actualValueBase: Decimal;
  actualPercent: Decimal;
  driftPercent: Decimal;
  rangeStatus: AllocationRangeStatus;
  rebalanceTargetPercent: Decimal;
};

export type GroupRow = GroupPortfolioRow | GroupCashRow;

export type GroupAllocation = {
  groupId: string;
  name: string;
  baseCurrency: string;
  cashBase: Decimal;
  totalValueBase: Decimal;
  rows: GroupRow[];
  targetSum: Decimal;
  targetMinSum: Decimal;
  targetMaxSum: Decimal;
  hasMissingPrices: boolean;
};

/**
 * Roll up every portfolio in the group into a single target-vs-actual table,
 * with cash as one of the rows. All values are converted to the group's base
 * currency.
 */
export async function computeGroupAllocation(
  groupId: string,
): Promise<GroupAllocation> {
  const group = await db.portfolioGroup.findUnique({
    where: { id: groupId },
    include: {
      portfolios: {
        orderBy: { name: "asc" },
        include: { _count: { select: { trades: true } } },
      },
    },
  });
  if (!group) throw new Error(`PortfolioGroup ${groupId} not found`);

  const baseCurrency = group.baseCurrency;
  const cashInfo = await computeGroupCash(groupId);

  let hasMissingPrices = false;
  const portfolioValues: Array<{
    portfolio: (typeof group.portfolios)[number];
    valueInGroupBase: Decimal;
  }> = [];

  for (const p of group.portfolios) {
    const h = await computeHoldings(p.id);
    if (h.hasMissingPrices) hasMissingPrices = true;
    const valueInGroupBase =
      p.baseCurrency.toUpperCase() === baseCurrency.toUpperCase()
        ? h.totalMarketValueBase
        : await convert(h.totalMarketValueBase, p.baseCurrency, baseCurrency);
    portfolioValues.push({ portfolio: p, valueInGroupBase });
  }

  const portfoliosTotal = portfolioValues.reduce(
    (acc, p) => acc.plus(p.valueInGroupBase),
    ZERO,
  );
  const totalValueBase = portfoliosTotal.plus(cashInfo.currentCash);

  const rows: GroupRow[] = [];
  for (const { portfolio, valueInGroupBase } of portfolioValues) {
    const targetMinPct = new Decimal(
      portfolio.targetMinPercentInGroup.toString(),
    );
    const targetMaxPct = new Decimal(
      portfolio.targetMaxPercentInGroup.toString(),
    );
    const targetPct = midpointPercent(targetMinPct, targetMaxPct);
    if (
      portfolio.name === "Unassigned" &&
      portfolio._count.trades === 0 &&
      targetPct.abs().lt(new Decimal("0.0001"))
    ) {
      continue;
    }
    const actualPct = totalValueBase.gt(0)
      ? valueInGroupBase.dividedBy(totalValueBase).times(100)
      : ZERO;
    const rangeDrift = computeRangeDrift({
      actualPercent: actualPct,
      targetMinPercent: targetMinPct,
      targetMaxPercent: targetMaxPct,
    });
    rows.push({
      kind: "portfolio",
      portfolioId: portfolio.id,
      name: portfolio.name,
      baseCurrency: portfolio.baseCurrency,
      targetPercent: targetPct,
      targetMinPercent: targetMinPct,
      targetMaxPercent: targetMaxPct,
      actualValueBase: valueInGroupBase,
      actualPercent: actualPct,
      driftPercent: rangeDrift.driftPercent,
      rangeStatus: rangeDrift.status,
      rebalanceTargetPercent: rangeDrift.rebalanceTargetPercent,
    });
  }

  const cashTargetMin = new Decimal(group.cashTargetMinPercent.toString());
  const cashTargetMax = new Decimal(group.cashTargetMaxPercent.toString());
  const cashTarget = midpointPercent(cashTargetMin, cashTargetMax);
  const cashActual = totalValueBase.gt(0)
    ? cashInfo.currentCash.dividedBy(totalValueBase).times(100)
    : ZERO;
  const cashRangeDrift = computeRangeDrift({
    actualPercent: cashActual,
    targetMinPercent: cashTargetMin,
    targetMaxPercent: cashTargetMax,
  });
  rows.push({
    kind: "cash",
    targetPercent: cashTarget,
    targetMinPercent: cashTargetMin,
    targetMaxPercent: cashTargetMax,
    actualValueBase: cashInfo.currentCash,
    actualPercent: cashActual,
    driftPercent: cashRangeDrift.driftPercent,
    rangeStatus: cashRangeDrift.status,
    rebalanceTargetPercent: cashRangeDrift.rebalanceTargetPercent,
  });

  const targetSum = rows.reduce((acc, r) => acc.plus(r.targetPercent), ZERO);
  const targetMinSum = rows.reduce(
    (acc, r) => acc.plus(r.targetMinPercent),
    ZERO,
  );
  const targetMaxSum = rows.reduce(
    (acc, r) => acc.plus(r.targetMaxPercent),
    ZERO,
  );

  return {
    groupId,
    name: group.name,
    baseCurrency,
    cashBase: cashInfo.currentCash,
    totalValueBase,
    rows,
    targetSum,
    targetMinSum,
    targetMaxSum,
    hasMissingPrices,
  };
}
