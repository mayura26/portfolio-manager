import type { PrismaClient } from "@/app/generated/prisma/client";

// A transaction client is structurally a PrismaClient without its top-level
// `$`-prefixed methods ($transaction, $connect, …). Typing it this way avoids
// depending on the generated Prisma namespace, whose shape varies by generator.
type Tx = Omit<PrismaClient, `$${string}`>;

/**
 * A plan row's price levels, as needed to reconcile its auto-created alerts.
 * Prices are decimal strings (or null when the level is unset).
 */
export type PlanLevels = {
  portfolioTargetId: string;
  instrumentId: string;
  symbol: string;
  intendedBuyPrice: string | null;
  intendedSellPrice: string | null;
};

/**
 * Reconcile the auto-created price alerts for a single plan (PortfolioTarget).
 *
 * - intendedBuyPrice  → a PRICE_BELOW alert ("entered buy zone")
 * - intendedSellPrice → a PRICE_ABOVE alert ("reached sell price")
 *
 * Only alerts owned by this plan (portfolioTargetId set) are touched, so
 * hand-made alerts are never clobbered. Levels that are cleared remove their
 * alert; changed levels update the existing one and re-arm it (status ACTIVE).
 */
export async function syncPlanAlerts(tx: Tx, plan: PlanLevels): Promise<void> {
  const existing = await tx.alert.findMany({
    where: { portfolioTargetId: plan.portfolioTargetId },
    select: { id: true, type: true },
  });
  const byType = new Map(existing.map((a) => [a.type, a.id]));

  await reconcileLevel(tx, {
    plan,
    type: "PRICE_BELOW",
    priceDirection: "below",
    priceTarget: plan.intendedBuyPrice,
    message: `Plan: ${plan.symbol} entered buy zone`,
    existingId: byType.get("PRICE_BELOW") ?? null,
  });

  await reconcileLevel(tx, {
    plan,
    type: "PRICE_ABOVE",
    priceDirection: "above",
    priceTarget: plan.intendedSellPrice,
    message: `Plan: ${plan.symbol} reached sell price`,
    existingId: byType.get("PRICE_ABOVE") ?? null,
  });
}

async function reconcileLevel(
  tx: Tx,
  opts: {
    plan: PlanLevels;
    type: "PRICE_ABOVE" | "PRICE_BELOW";
    priceDirection: "above" | "below";
    priceTarget: string | null;
    message: string;
    existingId: string | null;
  },
): Promise<void> {
  const { plan, type, priceDirection, priceTarget, message, existingId } = opts;

  // Level cleared → drop the alert we own for it.
  if (!priceTarget) {
    if (existingId) await tx.alert.delete({ where: { id: existingId } });
    return;
  }

  if (existingId) {
    // Update + re-arm so a moved level starts watching again.
    await tx.alert.update({
      where: { id: existingId },
      data: {
        priceTarget,
        priceDirection,
        message,
        status: "ACTIVE",
        snoozedUntil: null,
        triggeredAt: null,
      },
    });
    return;
  }

  await tx.alert.create({
    data: {
      type,
      priceDirection,
      instrumentId: plan.instrumentId,
      priceTarget,
      message,
      portfolioTargetId: plan.portfolioTargetId,
    },
  });
}
