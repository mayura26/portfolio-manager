"use server";

import { revalidatePath } from "next/cache";
import { analyzeComposition } from "@/lib/composition-ai";
import { db } from "@/lib/db";
import { computeGroupAllocation } from "@/lib/group-allocation";
import { computePortfolioAllocation } from "@/lib/portfolio-allocation";

export type CompositionActionState =
  | { ok: true }
  | { ok: false; error: string };

function getAiSettings(
  settings: {
    watchlistAiModel: string;
    watchlistAiReasoning: string;
  } | null,
) {
  const model = settings?.watchlistAiModel ?? "gpt-5.4";
  const reasoningEffort =
    (settings?.watchlistAiReasoning as
      | "minimal"
      | "low"
      | "medium"
      | "high"
      | undefined) ?? "medium";
  return { model, reasoningEffort };
}

export async function analyzePortfolioComposition(
  portfolioId: string,
): Promise<CompositionActionState> {
  const allocation = await computePortfolioAllocation(portfolioId);
  if (allocation.rows.length === 0) {
    return {
      ok: false,
      error: "Add holdings or targets before running composition analysis",
    };
  }
  const portfolio = await db.portfolio.findUnique({
    where: { id: portfolioId },
    include: { group: true },
  });
  if (!portfolio) return { ok: false, error: "Portfolio not found" };

  const settings = await db.settings.findUnique({ where: { id: "singleton" } });
  const { model, reasoningEffort } = getAiSettings(settings);

  try {
    const analysis = await analyzeComposition({
      scope: "portfolio",
      name: portfolio.name,
      baseCurrency: portfolio.baseCurrency,
      totalValueBase: allocation.totalMarketValueBase.toNumber(),
      investmentProfile: groupProfile(portfolio.group),
      metrics: {
        topPositionPercent: topPercent(
          allocation.rows.map((r) => r.actualPercent.toNumber()),
        ),
        top3PositionPercent: topPercent(
          allocation.rows.map((r) => r.actualPercent.toNumber()),
          3,
        ),
        holdingCount: allocation.rows.filter((r) => r.isHeld).length,
        sectorExposures: exposures(
          allocation.rows.map((r) => ({
            label: r.sector ?? "Unknown",
            percent: r.actualPercent.toNumber(),
          })),
        ),
        currencyExposures: exposures(
          allocation.rows.map((r) => ({
            label: r.currency,
            percent: r.actualPercent.toNumber(),
          })),
        ),
      },
      rows: allocation.rows.map((r) => ({
        rowKey: r.instrumentId,
        symbol: r.symbol,
        name: r.name,
        sector: r.sector,
        targetPercent: r.targetPercent.toNumber(),
        targetMinPercent: r.targetMinPercent.toNumber(),
        targetMaxPercent: r.targetMaxPercent.toNumber(),
        actualPercent: r.actualPercent.toNumber(),
        driftPercent: r.driftPercent.toNumber(),
        rangeStatus: r.rangeStatus,
        rebalanceTargetPercent: r.rebalanceTargetPercent.toNumber(),
        marketValueBase: r.marketValueBase.toNumber(),
        isHeld: r.isHeld,
      })),
      model,
      reasoningEffort,
    });

    await db.portfolio.update({
      where: { id: portfolioId },
      data: {
        aiCompositionAnalysis: analysis,
        aiCompositionGeneratedAt: new Date(),
      },
    });

    revalidatePath(`/portfolios/${portfolioId}`);
    revalidatePath(`/portfolios/${portfolioId}/composition`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Composition analysis failed: ${err.message}`
          : "Composition analysis failed",
    };
  }
}

export async function analyzeGroupComposition(
  groupId: string,
): Promise<CompositionActionState> {
  const allocation = await computeGroupAllocation(groupId);
  if (allocation.rows.length === 0) {
    return { ok: false, error: "Group has no portfolios or cash to analyse" };
  }

  const settings = await db.settings.findUnique({ where: { id: "singleton" } });
  const group = await db.portfolioGroup.findUnique({ where: { id: groupId } });
  if (!group) return { ok: false, error: "Group not found" };
  const { model, reasoningEffort } = getAiSettings(settings);

  try {
    const analysis = await analyzeComposition({
      scope: "group",
      name: allocation.name,
      baseCurrency: allocation.baseCurrency,
      totalValueBase: allocation.totalValueBase.toNumber(),
      investmentProfile: groupProfile(group),
      metrics: {
        topPortfolioPercent: topPercent(
          allocation.rows
            .filter((r) => r.kind === "portfolio")
            .map((r) => r.actualPercent.toNumber()),
        ),
        portfolioCount: allocation.rows.filter((r) => r.kind === "portfolio")
          .length,
        cashPercent:
          allocation.rows
            .find((r) => r.kind === "cash")
            ?.actualPercent.toNumber() ?? 0,
      },
      rows: allocation.rows.map((r) =>
        r.kind === "cash"
          ? {
              rowKey: "cash",
              label: "Cash",
              kind: "cash" as const,
              targetPercent: r.targetPercent.toNumber(),
              targetMinPercent: r.targetMinPercent.toNumber(),
              targetMaxPercent: r.targetMaxPercent.toNumber(),
              actualPercent: r.actualPercent.toNumber(),
              driftPercent: r.driftPercent.toNumber(),
              rangeStatus: r.rangeStatus,
              rebalanceTargetPercent: r.rebalanceTargetPercent.toNumber(),
              valueBase: r.actualValueBase.toNumber(),
            }
          : {
              rowKey: r.portfolioId,
              label: r.name,
              kind: "portfolio" as const,
              targetPercent: r.targetPercent.toNumber(),
              targetMinPercent: r.targetMinPercent.toNumber(),
              targetMaxPercent: r.targetMaxPercent.toNumber(),
              actualPercent: r.actualPercent.toNumber(),
              driftPercent: r.driftPercent.toNumber(),
              rangeStatus: r.rangeStatus,
              rebalanceTargetPercent: r.rebalanceTargetPercent.toNumber(),
              valueBase: r.actualValueBase.toNumber(),
            },
      ),
      model,
      reasoningEffort,
    });

    await db.portfolioGroup.update({
      where: { id: groupId },
      data: {
        aiCompositionAnalysis: analysis,
        aiCompositionGeneratedAt: new Date(),
      },
    });

    revalidatePath(`/groups/${groupId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Composition analysis failed: ${err.message}`
          : "Composition analysis failed",
    };
  }
}

function groupProfile(group: {
  investmentObjective: string | null;
  riskTolerance: string | null;
  timeHorizon: string | null;
  liquidityNeed: string | null;
  investmentProfileNotes: string | null;
}) {
  return {
    objective: group.investmentObjective,
    riskTolerance: group.riskTolerance,
    timeHorizon: group.timeHorizon,
    liquidityNeed: group.liquidityNeed,
    notes: group.investmentProfileNotes,
  };
}

function topPercent(values: number[], count = 1) {
  return values
    .filter((value) => value > 0)
    .sort((a, b) => b - a)
    .slice(0, count)
    .reduce((acc, value) => acc + value, 0);
}

function exposures(rows: { label: string; percent: number }[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.percent <= 0) continue;
    map.set(row.label, (map.get(row.label) ?? 0) + row.percent);
  }
  return Array.from(map.entries())
    .map(([label, percent]) => ({ label, percent }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 8);
}
