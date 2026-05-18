"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { portfolioTargetsSchema } from "@/lib/validators";

export type PortfolioTargetsActionState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

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
  const notes = formData.getAll("notes").map((v) => v.toString());

  if (
    instrumentIds.length !== buyPrices.length ||
    instrumentIds.length !== sellPrices.length ||
    instrumentIds.length !== trimGains.length ||
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
      await tx.portfolioTarget.upsert({
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
        },
        update: {
          targetPercent: row.targetPercent,
          targetMinPercent: row.targetMinPercent,
          targetMaxPercent: row.targetMaxPercent,
          intendedBuyPrice: row.intendedBuyPrice ?? null,
          intendedSellPrice: row.intendedSellPrice ?? null,
          trimAtGainPercent: row.trimAtGainPercent ?? null,
          notes: row.notes ?? null,
        },
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
