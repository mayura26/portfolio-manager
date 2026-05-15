"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { priceTargetSchema } from "@/lib/validators";

export type PriceTargetActionState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function revalidateAll() {
  revalidatePath("/stocks/[symbol]", "page");
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
}

/**
 * Create a user-drawn price target on a stock's chart. Stored as a price-cross
 * Alert: a target above the current price becomes a PRICE_ABOVE (sell) alert,
 * one below becomes PRICE_BELOW (buy). A percent-move input is converted to an
 * absolute price using the latest close at creation time.
 */
export async function createPriceTarget(
  _prev: PriceTargetActionState | undefined,
  formData: FormData,
): Promise<PriceTargetActionState> {
  const parsed = priceTargetSchema.safeParse({
    instrumentId: formData.get("instrumentId"),
    mode: formData.get("mode"),
    value: formData.get("value"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { instrumentId, mode, value, note } = parsed.data;

  const latest = await db.priceHistory.findFirst({
    where: { instrumentId },
    orderBy: { date: "desc" },
  });
  if (!latest) {
    return {
      ok: false,
      error: "No price history yet for this stock — cannot place a target.",
    };
  }
  const currentPrice = new Decimal(latest.close.toString());

  // Resolve the absolute target price.
  let targetPrice: Decimal;
  if (mode === "PRICE") {
    targetPrice = new Decimal(value);
  } else {
    // PERCENT: a positive value lifts the price, a negative one lowers it.
    targetPrice = currentPrice.times(
      new Decimal(1).plus(new Decimal(value).div(100)),
    );
  }

  if (targetPrice.lte(0)) {
    return {
      ok: false,
      error: "That percent move resolves to a price of zero or less.",
      fieldErrors: { value: ["Resolves to an invalid price"] },
    };
  }
  if (targetPrice.equals(currentPrice)) {
    return {
      ok: false,
      error:
        "Target equals the current price — pick a level above or below it.",
      fieldErrors: { value: ["Must differ from the current price"] },
    };
  }

  const isSell = targetPrice.gt(currentPrice);

  await db.alert.create({
    data: {
      type: isSell ? "PRICE_ABOVE" : "PRICE_BELOW",
      status: "ACTIVE",
      instrumentId,
      priceTarget: targetPrice.toFixed(4),
      priceDirection: isSell ? "above" : "below",
      referencePrice: currentPrice.toFixed(4),
      message: note,
    },
  });

  revalidateAll();
  return { ok: true };
}

/** Remove a user-drawn price target. */
export async function deletePriceTarget(alertId: string): Promise<void> {
  await db.alert.delete({ where: { id: alertId } });
  revalidateAll();
}
