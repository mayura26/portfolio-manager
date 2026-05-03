"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { findOrCreateInstrument } from "@/lib/instruments";
import { alertSchema } from "@/lib/validators";

export type AlertActionState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function parseFormData(formData: FormData) {
  return alertSchema.safeParse({
    type: formData.get("type"),
    portfolioId: emptyToNull(formData.get("portfolioId")),
    instrumentId: emptyToNull(formData.get("instrumentId")),
    priceTarget: emptyToNull(formData.get("priceTarget")),
    pctChange: emptyToNull(formData.get("pctChange")),
    reviewIntervalDays: emptyToNull(formData.get("reviewIntervalDays")),
    allocationThreshold: emptyToNull(formData.get("allocationThreshold")),
    message: formData.get("message"),
  });
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const str = value.toString().trim();
  return str.length === 0 ? null : str;
}

function revalidateAll() {
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
}

export async function createAlert(
  _prev: AlertActionState | undefined,
  formData: FormData,
): Promise<AlertActionState> {
  const yahooSymbol = emptyToNull(formData.get("yahooSymbol"));

  // Resolve instrument from yahooSymbol if provided
  let instrumentId: string | null = emptyToNull(formData.get("instrumentId"));
  if (!instrumentId && yahooSymbol) {
    try {
      const instrument = await findOrCreateInstrument(yahooSymbol);
      instrumentId = instrument.id;
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : "Could not resolve instrument",
      };
    }
  }

  // Inject resolved instrumentId into the form-derived data
  const adjusted = new FormData();
  for (const [k, v] of formData.entries()) adjusted.set(k, v);
  if (instrumentId) adjusted.set("instrumentId", instrumentId);

  const parsed = parseFormData(adjusted);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;

  // Capture reference price for percent-move and allocation drift alerts
  let referencePrice: string | null = null;
  if (
    data.instrumentId &&
    (data.type === "PCT_CHANGE" || data.type === "ALLOCATION_DRIFT")
  ) {
    const latest = await db.priceHistory.findFirst({
      where: { instrumentId: data.instrumentId },
      orderBy: { date: "desc" },
    });
    if (latest) referencePrice = latest.close.toString();
  }

  await db.alert.create({
    data: {
      type: data.type,
      portfolioId: data.portfolioId ?? null,
      instrumentId: data.instrumentId ?? null,
      priceTarget: data.priceTarget ?? null,
      priceDirection:
        data.type === "PRICE_ABOVE"
          ? "above"
          : data.type === "PRICE_BELOW"
            ? "below"
            : null,
      pctChange: data.pctChange ?? null,
      referencePrice,
      reviewIntervalDays: data.reviewIntervalDays ?? null,
      lastReviewDate: data.type === "REVIEW_TIMER" ? new Date() : null,
      allocationThreshold: data.allocationThreshold ?? null,
      message: data.message,
    },
  });

  revalidateAll();
  redirect("/alerts");
}

export async function snoozeAlert(alertId: string, hours = 24): Promise<void> {
  const until = new Date();
  until.setHours(until.getHours() + hours);
  await db.alert.update({
    where: { id: alertId },
    data: { status: "SNOOZED", snoozedUntil: until },
  });
  revalidateAll();
}

export async function dismissAlert(alertId: string): Promise<void> {
  await db.alert.update({
    where: { id: alertId },
    data: { status: "DISMISSED" },
  });
  revalidateAll();
}

export async function reactivateAlert(alertId: string): Promise<void> {
  await db.alert.update({
    where: { id: alertId },
    data: { status: "ACTIVE", snoozedUntil: null, triggeredAt: null },
  });
  revalidateAll();
}

export async function deleteAlert(alertId: string): Promise<void> {
  await db.alert.delete({ where: { id: alertId } });
  revalidateAll();
}
