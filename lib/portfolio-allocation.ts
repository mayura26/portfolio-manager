import Decimal from "decimal.js";
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
  driftPercent: Decimal;
  intendedBuyPrice: Decimal | null;
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
    const targetPct = target
      ? new Decimal(target.targetPercent.toString())
      : ZERO;
    const actualPct = h.allocationPercent ?? ZERO;
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
      driftPercent: actualPct.minus(targetPct),
      intendedBuyPrice: target?.intendedBuyPrice
        ? new Decimal(target.intendedBuyPrice.toString())
        : null,
      notes: target?.notes ?? null,
      hasTarget: !!target,
      isHeld: true,
    });
  }

  for (const t of targets) {
    if (seen.has(t.instrumentId)) continue;
    const targetPct = new Decimal(t.targetPercent.toString());
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
      driftPercent: targetPct.negated(),
      intendedBuyPrice: t.intendedBuyPrice
        ? new Decimal(t.intendedBuyPrice.toString())
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

  return {
    portfolioId,
    baseCurrency: holdings.baseCurrency,
    rows,
    totalMarketValueBase: holdings.totalMarketValueBase,
    targetSum,
    hasMissingPrices: holdings.hasMissingPrices,
  };
}
