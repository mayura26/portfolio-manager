"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { syncPlanAlerts } from "@/lib/plan-alerts";
import { reviewActionSchema } from "@/lib/validators";

export type ReviewActionState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function revalidate(reviewId?: string) {
  revalidatePath("/reviews");
  revalidatePath("/dashboard");
  if (reviewId) revalidatePath(`/reviews/${reviewId}`);
}

export async function startReview(reviewId: string): Promise<void> {
  await db.review.update({
    where: { id: reviewId },
    data: { status: "IN_PROGRESS" },
  });
  revalidate(reviewId);
}

export async function reopenReview(reviewId: string): Promise<void> {
  await db.review.update({
    where: { id: reviewId },
    data: { status: "PENDING", action: null, decisionDate: null },
  });
  revalidate(reviewId);
}

export async function completeReview(
  reviewId: string,
  _prev: ReviewActionState | undefined,
  formData: FormData,
): Promise<ReviewActionState> {
  const parsed = reviewActionSchema.safeParse({
    action: formData.get("action"),
    adjustedTargetPrice: emptyToNull(formData.get("adjustedTargetPrice")),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  if (parsed.data.action === "ADJUST_TARGET") {
    const adjustedTargetPrice = parsed.data.adjustedTargetPrice;
    if (!adjustedTargetPrice) {
      return {
        ok: false,
        error: "Please fix the errors below",
        fieldErrors: {
          adjustedTargetPrice: ["New target price is required"],
        },
      };
    }
    const result = await completeAdjustTargetReview(
      reviewId,
      adjustedTargetPrice,
      parsed.data.notes,
    );
    if (!result.ok) return result;
    revalidate(reviewId);
    redirect("/reviews");
  }

  await db.review.update({
    where: { id: reviewId },
    data: {
      status: "COMPLETED",
      action: parsed.data.action,
      notes: parsed.data.notes,
      decisionDate: new Date(),
    },
  });
  revalidate(reviewId);
  redirect("/reviews");
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const str = value.toString().trim();
  return str.length === 0 ? null : str;
}

async function completeAdjustTargetReview(
  reviewId: string,
  adjustedTargetPrice: string,
  notes: string | null,
): Promise<ReviewActionState> {
  const review = await db.review.findUnique({
    where: { id: reviewId },
    include: {
      alert: {
        include: {
          portfolioTarget: {
            include: { instrument: { select: { symbol: true } } },
          },
        },
      },
    },
  });

  if (!review) return { ok: false, error: "Review not found" };
  const alert = review.alert;
  const target = alert?.portfolioTarget;
  if (!alert || !isAdjustableAlertType(alert.type)) {
    return {
      ok: false,
      error: "This review is not linked to an adjustable price target",
    };
  }
  const alertType = alert.type;

  const newTarget = new Decimal(adjustedTargetPrice);
  const instrumentId = target?.instrumentId ?? alert.instrumentId;
  if (!instrumentId) {
    return {
      ok: false,
      error: "This review is missing the instrument for target validation",
    };
  }

  const latest = await db.priceHistory.findFirst({
    where: { instrumentId },
    orderBy: { date: "desc" },
  });

  if (latest) {
    const latestClose = new Decimal(latest.close.toString());
    if (targetDirection(alertType) === "below" && newTarget.gte(latestClose)) {
      return {
        ok: false,
        error: "Please fix the errors below",
        fieldErrors: {
          adjustedTargetPrice: [
            `Buy target must be below the latest close (${latestClose.toString()})`,
          ],
        },
      };
    }
    if (targetDirection(alertType) === "above" && newTarget.lte(latestClose)) {
      return {
        ok: false,
        error: "Please fix the errors below",
        fieldErrors: {
          adjustedTargetPrice: [
            `Sell target must be above the latest close (${latestClose.toString()})`,
          ],
        },
      };
    }
  }

  const oldTarget = target
    ? alertType === "PRICE_BELOW"
      ? target.intendedBuyPrice
      : target.intendedSellPrice
    : alert.priceTarget;
  const targetLabel = alertType === "PRICE_BELOW" ? "buy" : "sell";
  const auditNote = `Adjusted ${targetLabel} target from ${oldTarget?.toString() ?? "unset"} to ${adjustedTargetPrice}.`;
  const nextNotes = notes ? `${notes}\n\n${auditNote}` : auditNote;

  await db.$transaction(async (tx) => {
    if (
      target &&
      (alertType === "PRICE_BELOW" || alertType === "PRICE_ABOVE")
    ) {
      const updatedTarget = await tx.portfolioTarget.update({
        where: { id: target.id },
        data:
          alertType === "PRICE_BELOW"
            ? { intendedBuyPrice: adjustedTargetPrice }
            : { intendedSellPrice: adjustedTargetPrice },
        include: { instrument: { select: { symbol: true } } },
      });

      await syncPlanAlerts(tx, {
        portfolioTargetId: updatedTarget.id,
        instrumentId: updatedTarget.instrumentId,
        symbol: updatedTarget.instrument.symbol,
        intendedBuyPrice: updatedTarget.intendedBuyPrice?.toString() ?? null,
        intendedSellPrice: updatedTarget.intendedSellPrice?.toString() ?? null,
      });
    } else {
      await tx.alert.update({
        where: { id: alert.id },
        data: {
          priceTarget: adjustedTargetPrice,
          priceDirection: targetDirection(alertType),
          status: "ACTIVE",
          snoozedUntil: null,
          triggeredAt: null,
        },
      });
    }

    await tx.review.update({
      where: { id: reviewId },
      data: {
        status: "COMPLETED",
        action: "ADJUST_TARGET",
        notes: nextNotes,
        decisionDate: new Date(),
      },
    });
  });

  revalidatePath("/alerts");
  if (target) {
    revalidatePath(`/portfolios/${target.portfolioId}`);
    revalidatePath(`/portfolios/${target.portfolioId}/targets`);
    revalidatePath(`/portfolios/${target.portfolioId}/composition`);
  }

  return { ok: true };
}

function isAdjustableAlertType(
  type: string,
): type is "PRICE_BELOW" | "PRICE_ABOVE" | "TARGET_HIT" {
  return (
    type === "PRICE_BELOW" || type === "PRICE_ABOVE" || type === "TARGET_HIT"
  );
}

function targetDirection(
  type: "PRICE_BELOW" | "PRICE_ABOVE" | "TARGET_HIT",
): "below" | "above" {
  return type === "PRICE_BELOW" ? "below" : "above";
}

export async function deleteReview(reviewId: string): Promise<void> {
  await db.review.delete({ where: { id: reviewId } });
  revalidate(reviewId);
  redirect("/reviews");
}

export async function deleteReviewFromQueue(reviewId: string): Promise<void> {
  await db.review.delete({ where: { id: reviewId } });
  revalidate();
}
