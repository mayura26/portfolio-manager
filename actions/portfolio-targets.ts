"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveActiveForecast } from "@/lib/forecasts";
import { computeHoldings } from "@/lib/holdings";
import { syncPlanAlerts } from "@/lib/plan-alerts";
import { computePortfolioAllocation } from "@/lib/portfolio-allocation";
import {
  analyzePortfolioRecommendation,
  determinePortfolioRecommendation,
  fallbackRecommendationRationale,
  type PortfolioRecommendationAction,
  type PortfolioRecommendationSource,
} from "@/lib/portfolio-recommendations";
import { portfolioTargetsSchema } from "@/lib/validators";

export type PortfolioTargetsActionState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type GenerateTargetRecommendationState =
  | {
      ok: true;
      recommendation: {
        action: PortfolioRecommendationAction;
        source: PortfolioRecommendationSource;
        rationale: string;
        intendedBuyPrice: string;
        intendedSellPrice: string;
        trimAtGainPercent: string;
        generatedAt: string;
        model: string;
        reasoningEffort: string;
      };
    }
  | { ok: false; error: string };

export type TargetRecommendationDraft = {
  targetMinPercent: string;
  targetMaxPercent: string;
  intendedBuyPrice: string;
  intendedSellPrice: string;
  trimAtGainPercent: string;
  notes: string;
};

/**
 * Bulk-replace target rows for a portfolio. The submitted ranges must allow a
 * 100% allocation (or be empty, which clears all targets).
 */
export async function setPortfolioTargets(
  portfolioId: string,
  _prev: PortfolioTargetsActionState | undefined,
  formData: FormData,
): Promise<PortfolioTargetsActionState> {
  const instrumentIds = formData
    .getAll("instrumentId")
    .map((v) => v.toString());
  const targetMins = formData
    .getAll("targetMinPercent")
    .map((v) => v.toString());
  const targetMaxes = formData
    .getAll("targetMaxPercent")
    .map((v) => v.toString());
  const buyPrices = formData
    .getAll("intendedBuyPrice")
    .map((v) => v.toString());
  const sellPrices = formData
    .getAll("intendedSellPrice")
    .map((v) => v.toString());
  const trimGains = formData
    .getAll("trimAtGainPercent")
    .map((v) => v.toString());
  const recommendationActions = formData
    .getAll("recommendationAction")
    .map((v) => v.toString());
  const recommendationSources = formData
    .getAll("recommendationSource")
    .map((v) => v.toString());
  const recommendationRationales = formData
    .getAll("recommendationRationale")
    .map((v) => v.toString());
  const recommendationGeneratedAts = formData
    .getAll("recommendationGeneratedAt")
    .map((v) => v.toString());
  const recommendationModels = formData
    .getAll("recommendationModel")
    .map((v) => v.toString());
  const recommendationReasoningEfforts = formData
    .getAll("recommendationReasoningEffort")
    .map((v) => v.toString());
  const notes = formData.getAll("notes").map((v) => v.toString());

  if (
    instrumentIds.length !== buyPrices.length ||
    instrumentIds.length !== sellPrices.length ||
    instrumentIds.length !== trimGains.length ||
    instrumentIds.length !== recommendationActions.length ||
    instrumentIds.length !== recommendationSources.length ||
    instrumentIds.length !== recommendationRationales.length ||
    instrumentIds.length !== recommendationGeneratedAts.length ||
    instrumentIds.length !== recommendationModels.length ||
    instrumentIds.length !== recommendationReasoningEfforts.length ||
    instrumentIds.length !== notes.length ||
    instrumentIds.length !== targetMins.length ||
    instrumentIds.length !== targetMaxes.length
  ) {
    return { ok: false, error: "Mismatched target inputs" };
  }

  const rows = instrumentIds.map((id, i) => ({
    instrumentId: id,
    targetMinPercent: targetMins[i],
    targetMaxPercent: targetMaxes[i],
    intendedBuyPrice: buyPrices[i].length > 0 ? buyPrices[i] : null,
    intendedSellPrice: sellPrices[i].length > 0 ? sellPrices[i] : null,
    trimAtGainPercent: trimGains[i].length > 0 ? trimGains[i] : null,
    recommendationAction: recommendationActions[i],
    recommendationSource: recommendationSources[i] || "MANUAL",
    recommendationRationale: recommendationRationales[i],
    recommendationGeneratedAt: recommendationGeneratedAts[i],
    recommendationModel: recommendationModels[i],
    recommendationReasoningEffort: recommendationReasoningEfforts[i],
    notes: notes[i].length > 0 ? notes[i] : undefined,
  }));

  const parsed = portfolioTargetsSchema.safeParse({
    portfolioId,
    targets: rows,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Target ranges must allow a 100% allocation",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await db.$transaction(async (tx) => {
    const existing = await tx.portfolioTarget.findMany({
      where: { portfolioId },
      select: { instrumentId: true },
    });
    const newIds = new Set(parsed.data.targets.map((t) => t.instrumentId));
    const toDelete = existing
      .map((e) => e.instrumentId)
      .filter((id) => !newIds.has(id));

    if (toDelete.length > 0) {
      await tx.portfolioTarget.deleteMany({
        where: { portfolioId, instrumentId: { in: toDelete } },
      });
    }

    for (const row of parsed.data.targets) {
      const saved = await tx.portfolioTarget.upsert({
        where: {
          portfolioId_instrumentId: {
            portfolioId,
            instrumentId: row.instrumentId,
          },
        },
        create: {
          portfolioId,
          instrumentId: row.instrumentId,
          targetPercent: row.targetPercent,
          targetMinPercent: row.targetMinPercent,
          targetMaxPercent: row.targetMaxPercent,
          intendedBuyPrice: row.intendedBuyPrice ?? null,
          intendedSellPrice: row.intendedSellPrice ?? null,
          trimAtGainPercent: row.trimAtGainPercent ?? null,
          notes: row.notes ?? null,
          recommendationAction: row.recommendationAction,
          recommendationSource: row.recommendationSource ?? "MANUAL",
          recommendationRationale: row.recommendationRationale,
          recommendationGeneratedAt: row.recommendationGeneratedAt
            ? new Date(row.recommendationGeneratedAt)
            : null,
          recommendationModel: row.recommendationModel,
          recommendationReasoningEffort: row.recommendationReasoningEffort,
        },
        update: {
          targetPercent: row.targetPercent,
          targetMinPercent: row.targetMinPercent,
          targetMaxPercent: row.targetMaxPercent,
          intendedBuyPrice: row.intendedBuyPrice ?? null,
          intendedSellPrice: row.intendedSellPrice ?? null,
          trimAtGainPercent: row.trimAtGainPercent ?? null,
          notes: row.notes ?? null,
          recommendationAction: row.recommendationAction,
          recommendationSource: row.recommendationSource ?? "MANUAL",
          recommendationRationale: row.recommendationRationale,
          recommendationGeneratedAt: row.recommendationGeneratedAt
            ? new Date(row.recommendationGeneratedAt)
            : null,
          recommendationModel: row.recommendationModel,
          recommendationReasoningEffort: row.recommendationReasoningEffort,
        },
        include: { instrument: { select: { symbol: true } } },
      });

      // Keep auto-created buy/sell price alerts in sync with the plan levels.
      // Deleted targets cascade their alerts away via the FK, so only surviving
      // rows need reconciling here.
      await syncPlanAlerts(tx, {
        portfolioTargetId: saved.id,
        instrumentId: saved.instrumentId,
        symbol: saved.instrument.symbol,
        intendedBuyPrice: row.intendedBuyPrice ?? null,
        intendedSellPrice: row.intendedSellPrice ?? null,
      });
    }
  });

  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath(`/portfolios/${portfolioId}/targets`);
  revalidatePath(`/portfolios/${portfolioId}/composition`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deletePortfolioTarget(targetId: string): Promise<void> {
  const t = await db.portfolioTarget.findUnique({ where: { id: targetId } });
  if (!t) return;
  await db.portfolioTarget.delete({ where: { id: targetId } });
  revalidatePath(`/portfolios/${t.portfolioId}`);
  revalidatePath(`/portfolios/${t.portfolioId}/targets`);
}

export async function generatePortfolioTargetRecommendation(
  portfolioId: string,
  instrumentId: string,
  draft: TargetRecommendationDraft,
): Promise<GenerateTargetRecommendationState> {
  const [portfolio, allocation, holdings, settings, forecast, instrument] =
    await Promise.all([
      db.portfolio.findUnique({ where: { id: portfolioId } }),
      computePortfolioAllocation(portfolioId),
      computeHoldings(portfolioId),
      db.settings.findUnique({ where: { id: "singleton" } }),
      resolveActiveForecast(instrumentId),
      db.instrument.findUnique({ where: { id: instrumentId } }),
    ]);

  if (!portfolio) return { ok: false, error: "Portfolio not found" };
  if (!instrument) return { ok: false, error: "Instrument not found" };

  const row = allocation.rows.find((r) => r.instrumentId === instrumentId);
  const globalGainThresholdPercent = settings?.sellSignalGainPercent
    ? Number(settings.sellSignalGainPercent.toString())
    : 25;
  const targetMinPercent = numberOrZero(draft.targetMinPercent);
  const targetMaxPercent = numberOrZero(draft.targetMaxPercent);
  const actualPercent = row?.actualPercent.toNumber() ?? 0;
  const rangeStatus = deriveRangeStatus(
    actualPercent,
    targetMinPercent,
    targetMaxPercent,
  );
  const driftPercent =
    rangeStatus === "overweight"
      ? actualPercent - targetMaxPercent
      : rangeStatus === "underweight"
        ? actualPercent - targetMinPercent
        : 0;
  const holding = holdings.holdings.find(
    (h) => h.instrumentId === instrumentId,
  );

  const ruleInput = {
    isHeld: row?.isHeld ?? false,
    currentPrice: row?.marketPrice?.toNumber() ?? null,
    intendedBuyPrice: numberOrNull(draft.intendedBuyPrice),
    intendedSellPrice: numberOrNull(draft.intendedSellPrice),
    trimAtGainPercent: numberOrNull(draft.trimAtGainPercent),
    globalGainThresholdPercent,
    unrealizedGainPercent: holding?.unrealizedPnLPercent?.toNumber() ?? null,
    rangeStatus,
    driftPercent,
    forecastTargetPrice: forecast?.targetPrice
      ? Number(forecast.targetPrice.toString())
      : null,
    forecastHighCase: forecast?.highCase
      ? Number(forecast.highCase.toString())
      : null,
    streetTargetMean: forecast?.streetTargetMean
      ? Number(forecast.streetTargetMean.toString())
      : null,
    streetTargetHigh: forecast?.streetTargetHigh
      ? Number(forecast.streetTargetHigh.toString())
      : null,
  } as const;

  const ruleResult = determinePortfolioRecommendation(ruleInput);
  const model = settings?.watchlistAiModel ?? "gpt-5.4";
  const reasoningEffort =
    (settings?.watchlistAiReasoning as
      | "minimal"
      | "low"
      | "medium"
      | "high"
      | undefined) ?? "medium";

  let recommendation: {
    action: PortfolioRecommendationAction;
    rationale: string;
    intendedBuyPrice: number | null;
    intendedSellPrice: number | null;
    trimAtGainPercent: number | null;
    generatedAt: string;
  };
  try {
    recommendation = await analyzePortfolioRecommendation({
      ...ruleInput,
      symbol: instrument.symbol,
      name: instrument.name,
      currency: instrument.currency,
      targetMinPercent,
      targetMaxPercent,
      actualPercent,
      marketValueBase: row?.marketValueBase.toNumber() ?? 0,
      notes: draft.notes.trim() || null,
      ruleResult,
      model,
      reasoningEffort,
    });
  } catch (err) {
    if (err instanceof Error && err.message !== "OPENAI_API_KEY is not set") {
      return {
        ok: false,
        error: `Recommendation generation failed: ${err.message}`,
      };
    }
    recommendation = {
      action: ruleResult.action,
      rationale: fallbackRecommendationRationale(ruleResult),
      intendedBuyPrice: null,
      intendedSellPrice: null,
      trimAtGainPercent: null,
      generatedAt: new Date().toISOString(),
    };
  }

  const existingTarget = await db.portfolioTarget.findUnique({
    where: { portfolioId_instrumentId: { portfolioId, instrumentId } },
  });

  if (existingTarget) {
    await db.portfolioTarget.update({
      where: { id: existingTarget.id },
      data: {
        recommendationAction: recommendation.action,
        recommendationSource: "AI",
        recommendationRationale: recommendation.rationale,
        recommendationGeneratedAt: new Date(recommendation.generatedAt),
        recommendationModel: model,
        recommendationReasoningEffort: reasoningEffort,
      },
    });
  }

  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath(`/portfolios/${portfolioId}/targets`);
  revalidatePath(`/portfolios/${portfolioId}/composition`);
  revalidatePath("/reviews/audit");

  const numToStr = (n: number | null): string => (n != null ? String(n) : "");

  return {
    ok: true,
    recommendation: {
      action: recommendation.action,
      rationale: recommendation.rationale,
      generatedAt: recommendation.generatedAt,
      intendedBuyPrice: numToStr(recommendation.intendedBuyPrice),
      intendedSellPrice: numToStr(recommendation.intendedSellPrice),
      trimAtGainPercent: numToStr(recommendation.trimAtGainPercent),
      source: "AI",
      model,
      reasoningEffort,
    },
  };
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function numberOrZero(value: string): number {
  return numberOrNull(value) ?? 0;
}

function deriveRangeStatus(
  actualPercent: number,
  targetMinPercent: number,
  targetMaxPercent: number,
): "on-target" | "underweight" | "overweight" {
  if (actualPercent < targetMinPercent) return "underweight";
  if (actualPercent > targetMaxPercent) return "overweight";
  return "on-target";
}
