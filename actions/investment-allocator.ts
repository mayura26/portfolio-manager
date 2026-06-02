"use server";

import { db } from "@/lib/db";
import {
  type InvestmentAllocation,
  analyzeInvestmentAllocation,
} from "@/lib/investment-allocator";
import { computeGroupAllocation } from "@/lib/group-allocation";
import { computePortfolioAllocation } from "@/lib/portfolio-allocation";
import { computeHoldings } from "@/lib/holdings";
import { getSettings } from "@/lib/settings";

export type InvestmentAllocatorResult =
  | { ok: true; result: InvestmentAllocation }
  | { ok: false; error: string };

export async function generateInvestmentAllocation(
  groupId: string,
  cashToInvest: number,
): Promise<InvestmentAllocatorResult> {
  try {
    if (!cashToInvest || cashToInvest <= 0) {
      return { ok: false, error: "Cash to invest must be greater than zero" };
    }

    const [group, groupAllocation, settings, portfolios] = await Promise.all([
      db.portfolioGroup.findUnique({ where: { id: groupId } }),
      computeGroupAllocation(groupId),
      getSettings(),
      db.portfolio.findMany({ where: { groupId }, orderBy: { name: "asc" } }),
    ]);

    if (!group) return { ok: false, error: "Portfolio group not found" };

    const totalGroupValue = Number(groupAllocation.totalValueBase.toString());
    const minTradePercent = Number(settings.minTradePercent.toString());
    const minTradeAmount = (totalGroupValue * minTradePercent) / 100;
    const maxPositions =
      minTradeAmount > 0
        ? Math.min(Math.floor(cashToInvest / minTradeAmount), 10)
        : 10;

    // Per-portfolio: allocation rows + unrealized P&L from holdings
    type EnrichedRow = {
      instrumentId: string;
      portfolioName: string;
      symbol: string;
      name: string;
      sector: string | null;
      actualPercent: number;
      targetPercent: number;
      driftPercent: number;
      rangeStatus: "on-target" | "underweight" | "overweight";
      recommendationAction: "BUY" | "SELL" | "TRIM" | null;
      intendedBuyPrice: number | null;
      unrealizedPnLPercent: number | null;
      forecast: {
        targetPrice: number;
        expectedReturn: number | null;
        lowCase: number | null;
        highCase: number | null;
      } | null;
    };

    const enrichedRows: EnrichedRow[] = [];

    for (const portfolio of portfolios) {
      const [allocation, holdings] = await Promise.all([
        computePortfolioAllocation(portfolio.id),
        computeHoldings(portfolio.id),
      ]);

      const pnlMap = new Map<string, number | null>();
      for (const h of holdings.holdings) {
        pnlMap.set(
          h.instrumentId,
          h.unrealizedPnLPercent ? Number(h.unrealizedPnLPercent.toString()) : null,
        );
      }

      for (const row of allocation.rows) {
        enrichedRows.push({
          instrumentId: row.instrumentId,
          portfolioName: portfolio.name,
          symbol: row.symbol,
          name: row.name,
          sector: row.sector,
          actualPercent: Number(row.actualPercent.toString()),
          targetPercent: Number(row.targetPercent.toString()),
          driftPercent: Number(row.driftPercent.toString()),
          rangeStatus: row.rangeStatus as "on-target" | "underweight" | "overweight",
          recommendationAction: row.recommendationAction,
          intendedBuyPrice: row.intendedBuyPrice
            ? Number(row.intendedBuyPrice.toString())
            : null,
          unrealizedPnLPercent: pnlMap.get(row.instrumentId) ?? null,
          forecast: null,
        });
      }
    }

    // Attach latest forecasts
    const instrumentIds = [...new Set(enrichedRows.map((r) => r.instrumentId))];
    const forecastRows = await db.instrumentForecast.findMany({
      where: { instrumentId: { in: instrumentIds } },
      orderBy: { generatedAt: "desc" },
    });

    const latestForecast = new Map<string, (typeof forecastRows)[number]>();
    for (const f of forecastRows) {
      if (!latestForecast.has(f.instrumentId)) {
        latestForecast.set(f.instrumentId, f);
      }
    }

    for (const row of enrichedRows) {
      const f = latestForecast.get(row.instrumentId);
      if (f) {
        row.forecast = {
          targetPrice: Number(f.targetPrice.toString()),
          expectedReturn: f.expectedReturn
            ? Number(f.expectedReturn.toString())
            : null,
          lowCase: f.lowCase ? Number(f.lowCase.toString()) : null,
          highCase: f.highCase ? Number(f.highCase.toString()) : null,
        };
      }
    }

    const result = await analyzeInvestmentAllocation({
      groupName: group.name,
      baseCurrency: group.baseCurrency,
      totalGroupValue,
      cashToInvest,
      minTradeAmount,
      maxPositions,
      investmentProfile: {
        objective: group.investmentObjective,
        riskTolerance: group.riskTolerance,
        timeHorizon: group.timeHorizon,
        liquidityNeed: group.liquidityNeed,
        notes: group.investmentProfileNotes,
      },
      holdings: enrichedRows,
      model: settings.watchlistAiModel,
      reasoningEffort: settings.watchlistAiReasoning as
        | "minimal"
        | "low"
        | "medium"
        | "high",
    });

    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}
