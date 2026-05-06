import Decimal from "decimal.js";
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
  actualValueBase: Decimal;
  actualPercent: Decimal;
  driftPercent: Decimal;
};

export type GroupCashRow = {
  kind: "cash";
  targetPercent: Decimal;
  actualValueBase: Decimal;
  actualPercent: Decimal;
  driftPercent: Decimal;
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
    include: { portfolios: { orderBy: { name: "asc" } } },
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
    const targetPct = new Decimal(portfolio.targetPercentInGroup.toString());
    const actualPct = totalValueBase.gt(0)
      ? valueInGroupBase.dividedBy(totalValueBase).times(100)
      : ZERO;
    rows.push({
      kind: "portfolio",
      portfolioId: portfolio.id,
      name: portfolio.name,
      baseCurrency: portfolio.baseCurrency,
      targetPercent: targetPct,
      actualValueBase: valueInGroupBase,
      actualPercent: actualPct,
      driftPercent: actualPct.minus(targetPct),
    });
  }

  const cashTarget = new Decimal(group.cashTargetPercent.toString());
  const cashActual = totalValueBase.gt(0)
    ? cashInfo.currentCash.dividedBy(totalValueBase).times(100)
    : ZERO;
  rows.push({
    kind: "cash",
    targetPercent: cashTarget,
    actualValueBase: cashInfo.currentCash,
    actualPercent: cashActual,
    driftPercent: cashActual.minus(cashTarget),
  });

  const targetSum = rows.reduce((acc, r) => acc.plus(r.targetPercent), ZERO);

  return {
    groupId,
    name: group.name,
    baseCurrency,
    cashBase: cashInfo.currentCash,
    totalValueBase,
    rows,
    targetSum,
    hasMissingPrices,
  };
}
