"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { portfolioTargetsSchema } from "@/lib/validators";

export type PortfolioTargetsActionState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Bulk-replace the target rows for a portfolio. The submitted set must sum to
 * exactly 100% (or be empty, which clears all targets).
 */
export async function setPortfolioTargets(
  portfolioId: string,
  _prev: PortfolioTargetsActionState | undefined,
  formData: FormData,
): Promise<PortfolioTargetsActionState> {
  const instrumentIds = formData
    .getAll("instrumentId")
    .map((v) => v.toString());
  const targets = formData.getAll("targetPercent").map((v) => v.toString());
  const buyPrices = formData
    .getAll("intendedBuyPrice")
    .map((v) => v.toString());
  const notes = formData.getAll("notes").map((v) => v.toString());

  if (
    instrumentIds.length !== targets.length ||
    instrumentIds.length !== buyPrices.length ||
    instrumentIds.length !== notes.length
  ) {
    return { ok: false, error: "Mismatched target inputs" };
  }

  const rows = instrumentIds.map((id, i) => ({
    instrumentId: id,
    targetPercent: targets[i],
    intendedBuyPrice: buyPrices[i].length > 0 ? buyPrices[i] : null,
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
        parsed.error.issues[0]?.message ?? "Targets must sum to exactly 100%",
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
          intendedBuyPrice: row.intendedBuyPrice ?? null,
          notes: row.notes ?? null,
        },
        update: {
          targetPercent: row.targetPercent,
          intendedBuyPrice: row.intendedBuyPrice ?? null,
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
