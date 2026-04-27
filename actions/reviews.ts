"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
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
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
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

export async function deleteReview(reviewId: string): Promise<void> {
  await db.review.delete({ where: { id: reviewId } });
  revalidate(reviewId);
  redirect("/reviews");
}
