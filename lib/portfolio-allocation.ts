import Decimal from "decimal.js";
import {
  type AllocationRangeStatus,
  computeRangeDrift,
  midpointPercent,
} from "@/lib/allocation-range";
import { db } from "@/lib/db";
import { computeHoldings } from "@/lib/holdings";

const ZERO = new Decimal(0);

export type AllocationRow = {
  instrumentId: string;
  yahooSymbol: string;
  symbol: string;
  name: string;
  currency: string;
  sector: string | null;
  quantity: Decimal;
  marketPrice: Decimal | null;
  marketValueBase: Decimal;
  actualPercent: Decimal;
  targetPercent: Decimal;
  targetMinPercent: Decimal;
  targetMaxPercent: Decimal;
  driftPercent: Decimal;
  rangeStatus: AllocationRangeStatus;
  rebalanceTargetPercent: Decimal;
  intendedBuyPrice: Decimal | null;
  intendedSellPrice: Decimal | null;
  trimAtGainPercent: Decimal | null;
  notes: string | null;
  hasTarget: boolean;
  isHeld: boolean;
};

export type PortfolioAllocation = {
  portfolioId: string;
  baseCurrency: string;
  rows: AllocationRow[];
  totalMarketValueBase: Decimal;
  targetSum: Decimal;
  targetMinSum: Decimal;
  targetMaxSum: Decimal;
  hasMissingPrices: boolean;
};

/**
 * Combine holdings (computed from trades) with PortfolioTarget rows to produce
 * a single allocation table. Target-only rows (no open lots) are included with
 * actualPercent = 0 so the user sees the full target picture in one place.
 */
export async function computePortfolioAllocation(
  portfolioId: string,
): Promise<PortfolioAllocation> {
  const [holdings, targets] = await Promise.all([
    computeHoldings(portfolioId),
    db.portfolioTarget.findMany({
      where: { portfolioId },
      include: { instrument: true },
    }),
  ]);

  const targetMap = new Map(targets.map((t) => [t.instrumentId, t]));
  const rows: AllocationRow[] = [];
  const seen = new Set<string>();

  for (const h of holdings.holdings) {
    seen.add(h.instrumentId);
    const target = targetMap.get(h.instrumentId);
    const targetMinPct = target
      ? new Decimal(target.targetMinPercent.toString())
      : ZERO;
    const targetMaxPct = target
      ? new Decimal(target.targetMaxPercent.toString())
      : ZERO;
    const targetPct = target
      ? midpointPercent(targetMinPct, targetMaxPct)
      : ZERO;
    const actualPct = h.allocationPercent ?? ZERO;
    const rangeDrift = target
      ? computeRangeDrift({
          actualPercent: actualPct,
          targetMinPercent: targetMinPct,
          targetMaxPercent: targetMaxPct,
        })
      : {
          status: "on-target" as const,
          driftPercent: ZERO,
          rebalanceTargetPercent: actualPct,
        };
    rows.push({
      instrumentId: h.instrumentId,
      yahooSymbol: h.yahooSymbol,
      symbol: h.symbol,
      name: h.name,
      currency: h.currency,
      sector: h.sector,
      quantity: h.quantity,
      marketPrice: h.marketPrice,
      marketValueBase: h.marketValueBase ?? ZERO,
      actualPercent: actualPct,
      targetPercent: targetPct,
      targetMinPercent: targetMinPct,
      targetMaxPercent: targetMaxPct,
      driftPercent: rangeDrift.driftPercent,
      rangeStatus: rangeDrift.status,
      rebalanceTargetPercent: rangeDrift.rebalanceTargetPercent,
      intendedBuyPrice: target?.intendedBuyPrice
        ? new Decimal(target.intendedBuyPrice.toString())
        : null,
      intendedSellPrice: target?.intendedSellPrice
        ? new Decimal(target.intendedSellPrice.toString())
        : null,
      trimAtGainPercent: target?.trimAtGainPercent
        ? new Decimal(target.trimAtGainPercent.toString())
        : null,
      notes: target?.notes ?? null,
      hasTarget: !!target,
      isHeld: true,
    });
  }

  for (const t of targets) {
    if (seen.has(t.instrumentId)) continue;
    const targetMinPct = new Decimal(t.targetMinPercent.toString());
    const targetMaxPct = new Decimal(t.targetMaxPercent.toString());
    const targetPct = midpointPercent(targetMinPct, targetMaxPct);
    const rangeDrift = computeRangeDrift({
      actualPercent: ZERO,
      targetMinPercent: targetMinPct,
      targetMaxPercent: targetMaxPct,
    });
    rows.push({
      instrumentId: t.instrumentId,
      yahooSymbol: t.instrument.yahooSymbol,
      symbol: t.instrument.symbol,
      name: t.instrument.name,
      currency: t.instrument.currency,
      sector: t.instrument.sector,
      quantity: ZERO,
      marketPrice: null,
      marketValueBase: ZERO,
      actualPercent: ZERO,
      targetPercent: targetPct,
      targetMinPercent: targetMinPct,
      targetMaxPercent: targetMaxPct,
      driftPercent: rangeDrift.driftPercent,
      rangeStatus: rangeDrift.status,
      rebalanceTargetPercent: rangeDrift.rebalanceTargetPercent,
      intendedBuyPrice: t.intendedBuyPrice
        ? new Decimal(t.intendedBuyPrice.toString())
        : null,
      intendedSellPrice: t.intendedSellPrice
        ? new Decimal(t.intendedSellPrice.toString())
        : null,
      trimAtGainPercent: t.trimAtGainPercent
        ? new Decimal(t.trimAtGainPercent.toString())
        : null,
      notes: t.notes,
      hasTarget: true,
      isHeld: false,
    });
  }

  rows.sort((a, b) => {
    const av = a.marketValueBase;
    const bv = b.marketValueBase;
    const cmp = bv.comparedTo(av);
    if (cmp !== 0) return cmp;
    return b.targetPercent.comparedTo(a.targetPercent);
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
    portfolioId,
    baseCurrency: holdings.baseCurrency,
    rows,
    totalMarketValueBase: holdings.totalMarketValueBase,
    targetSum,
    targetMinSum,
    targetMaxSum,
    hasMissingPrices: holdings.hasMissingPrices,
  };
}
