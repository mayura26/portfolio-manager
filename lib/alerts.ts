import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { computeHoldings } from "@/lib/holdings";
import { createNotification } from "@/lib/notifications";

const ZERO = new Decimal(0);

export type EvaluationResult = {
  evaluated: number;
  triggered: number;
  failures: { alertId: string; error: string }[];
};

/**
 * Evaluate every active alert and fire notifications + create review tasks
 * for any that meet their trigger condition.
 */
export async function evaluateAllAlerts(): Promise<EvaluationResult> {
  const now = new Date();

  const alerts = await db.alert.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }],
    },
    include: {
      instrument: true,
      portfolio: true,
      forecast: true,
    },
  });

  let triggered = 0;
  const failures: { alertId: string; error: string }[] = [];

  for (const alert of alerts) {
    try {
      const fired = await evaluateOne(alert, now);
      if (fired) triggered++;
    } catch (err) {
      failures.push({
        alertId: alert.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { evaluated: alerts.length, triggered, failures };
}

type AlertWithRelations = Awaited<
  ReturnType<typeof db.alert.findMany>
>[number] & {
  instrument: Awaited<ReturnType<typeof db.instrument.findFirst>>;
  portfolio: Awaited<ReturnType<typeof db.portfolio.findFirst>>;
  forecast: Awaited<ReturnType<typeof db.instrumentForecast.findFirst>>;
};

async function evaluateOne(
  alert: AlertWithRelations,
  now: Date,
): Promise<boolean> {
  switch (alert.type) {
    case "PRICE_ABOVE":
      return await evalPriceCross(alert, "above");
    case "PRICE_BELOW":
      return await evalPriceCross(alert, "below");
    case "PCT_CHANGE":
      return await evalPctChange(alert);
    case "REVIEW_TIMER":
      return await evalReviewTimer(alert, now);
    case "ALLOCATION_DRIFT":
      return await evalAllocationDrift(alert);
    case "FORECAST_DEVIATION":
      return await evalForecastDeviation(alert);
    case "DIVIDEND_EVENT":
    case "EARNINGS_EVENT":
      // Event-based alerts require a calendar feed — out of scope for MVP.
      return false;
    default:
      return false;
  }
}

async function latestPrice(instrumentId: string): Promise<Decimal | null> {
  const row = await db.priceHistory.findFirst({
    where: { instrumentId },
    orderBy: { date: "desc" },
  });
  if (!row) return null;
  return new Decimal(row.close.toString());
}

async function previousPrice(
  instrumentId: string,
  before: Date,
): Promise<Decimal | null> {
  const row = await db.priceHistory.findFirst({
    where: { instrumentId, date: { lt: before } },
    orderBy: { date: "desc" },
  });
  if (!row) return null;
  return new Decimal(row.close.toString());
}

async function fireAlert(
  alert: AlertWithRelations,
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const now = new Date();

  const updated = await db.alert.update({
    where: { id: alert.id },
    data: { status: "TRIGGERED", triggeredAt: now },
  });

  await db.review.create({
    data: {
      alertId: alert.id,
      portfolioId: alert.portfolioId,
      instrumentId: alert.instrumentId,
      triggerReason: message,
      status: "PENDING",
      priority: priorityFor(alert.type),
    },
  });

  await createNotification({
    type: notificationTypeFor(alert.type),
    title: titleFor(alert),
    message,
    alertId: alert.id,
    metadata,
  });

  void updated;
}

function priorityFor(type: AlertWithRelations["type"]): number {
  switch (type) {
    case "PRICE_ABOVE":
    case "PRICE_BELOW":
    case "PCT_CHANGE":
      return 2;
    case "FORECAST_DEVIATION":
      return 2;
    case "ALLOCATION_DRIFT":
      return 1;
    case "REVIEW_TIMER":
      return 0;
    default:
      return 0;
  }
}

function notificationTypeFor(type: AlertWithRelations["type"]) {
  switch (type) {
    case "PRICE_ABOVE":
    case "PRICE_BELOW":
    case "PCT_CHANGE":
      return "PRICE_ALERT" as const;
    case "REVIEW_TIMER":
      return "REVIEW_DUE" as const;
    case "ALLOCATION_DRIFT":
      return "ALLOCATION_DRIFT" as const;
    case "FORECAST_DEVIATION":
      return "FORECAST_DEVIATION" as const;
    case "DIVIDEND_EVENT":
      return "DIVIDEND_EVENT" as const;
    case "EARNINGS_EVENT":
      return "EARNINGS_EVENT" as const;
    default:
      return "SYSTEM" as const;
  }
}

function titleFor(alert: AlertWithRelations): string {
  const sym = alert.instrument?.symbol ?? alert.portfolio?.name ?? "Alert";
  switch (alert.type) {
    case "PRICE_ABOVE":
      return `${sym} crossed above target`;
    case "PRICE_BELOW":
      return `${sym} fell below target`;
    case "PCT_CHANGE":
      return `${sym} moved beyond threshold`;
    case "REVIEW_TIMER":
      return `Review due: ${sym}`;
    case "ALLOCATION_DRIFT":
      return `Allocation drift in ${sym}`;
    case "FORECAST_DEVIATION":
      return `${sym} drifted from forecast`;
    default:
      return `Alert: ${sym}`;
  }
}

async function evalPriceCross(
  alert: AlertWithRelations,
  direction: "above" | "below",
): Promise<boolean> {
  if (!alert.instrumentId || !alert.priceTarget) return false;
  const price = await latestPrice(alert.instrumentId);
  if (!price) return false;
  const target = new Decimal(alert.priceTarget.toString());

  const triggered = direction === "above" ? price.gt(target) : price.lt(target);
  if (!triggered) return false;

  const sym = alert.instrument?.symbol ?? "instrument";
  const cur = alert.instrument?.currency ?? "USD";
  const message =
    direction === "above"
      ? `${sym} is at ${formatMoney(price, cur)}, above target ${formatMoney(target, cur)}.`
      : `${sym} is at ${formatMoney(price, cur)}, below target ${formatMoney(target, cur)}.`;

  await fireAlert(alert, message, {
    price: price.toString(),
    target: target.toString(),
    direction,
  });
  return true;
}

async function evalPctChange(alert: AlertWithRelations): Promise<boolean> {
  if (!alert.instrumentId || !alert.pctChange) return false;
  const price = await latestPrice(alert.instrumentId);
  if (!price) return false;
  const reference = alert.referencePrice
    ? new Decimal(alert.referencePrice.toString())
    : await previousPrice(alert.instrumentId, new Date());
  if (!reference || reference.isZero()) return false;

  const threshold = new Decimal(alert.pctChange.toString());
  const move = price.minus(reference).dividedBy(reference).times(100);
  if (move.abs().lt(threshold)) return false;

  const sym = alert.instrument?.symbol ?? "instrument";
  const message = `${sym} moved ${move.toFixed(2)}% from ${reference.toFixed(2)} to ${price.toFixed(2)} (threshold ±${threshold.toFixed(2)}%).`;

  await fireAlert(alert, message, {
    movePercent: move.toString(),
    threshold: threshold.toString(),
  });
  return true;
}

async function evalReviewTimer(
  alert: AlertWithRelations,
  now: Date,
): Promise<boolean> {
  if (!alert.reviewIntervalDays) return false;
  const last = alert.lastReviewDate ?? alert.createdAt;
  const due = new Date(last);
  due.setUTCDate(due.getUTCDate() + alert.reviewIntervalDays);
  if (now < due) return false;

  const sym = alert.instrument?.symbol ?? alert.portfolio?.name ?? "item";
  const message = `Review timer: ${alert.reviewIntervalDays} days have passed since the last check on ${sym}.`;

  await fireAlert(alert, message, {
    intervalDays: alert.reviewIntervalDays,
    lastReviewDate: last.toISOString(),
  });
  await db.alert.update({
    where: { id: alert.id },
    data: { lastReviewDate: now },
  });
  return true;
}

async function evalForecastDeviation(
  alert: AlertWithRelations,
): Promise<boolean> {
  if (
    !alert.instrumentId ||
    !alert.deviationThreshold ||
    !alert.forecastId ||
    !alert.forecast
  ) {
    return false;
  }
  const price = await latestPrice(alert.instrumentId);
  if (!price) return false;

  const target = new Decimal(alert.forecast.targetPrice.toString());
  if (target.lte(0)) return false;

  const deviation = price.minus(target).dividedBy(target).times(100);
  const threshold = new Decimal(alert.deviationThreshold.toString());
  if (deviation.abs().lt(threshold)) return false;

  const sym = alert.instrument?.symbol ?? "instrument";
  const cur = alert.instrument?.currency ?? "USD";
  const direction = deviation.gt(0) ? "above" : "below";
  const message = `${sym} is at ${formatMoney(price, cur)}, ${deviation.abs().toFixed(1)}% ${direction} the AI forecast target of ${formatMoney(target, cur)} (threshold ±${threshold.toFixed(1)}%).`;

  await fireAlert(alert, message, {
    currentPrice: price.toString(),
    targetPrice: target.toString(),
    deviationPercent: deviation.toString(),
    threshold: threshold.toString(),
    forecastId: alert.forecastId,
  });
  return true;
}

async function evalAllocationDrift(
  alert: AlertWithRelations,
): Promise<boolean> {
  if (!alert.portfolioId || !alert.instrumentId || !alert.allocationThreshold)
    return false;
  const data = await computeHoldings(alert.portfolioId);
  const holding = data.holdings.find(
    (h) => h.instrumentId === alert.instrumentId,
  );
  if (!holding || !holding.allocationPercent) return false;

  const threshold = new Decimal(alert.allocationThreshold.toString());
  const reference = alert.referencePrice
    ? new Decimal(alert.referencePrice.toString())
    : ZERO;

  const drift = holding.allocationPercent.minus(reference).abs();
  if (drift.lt(threshold)) return false;

  const sym = alert.instrument?.symbol ?? "instrument";
  const message = `${sym} now ${holding.allocationPercent.toFixed(1)}% of portfolio (target ${reference.toFixed(1)}%, threshold ±${threshold.toFixed(1)}%).`;

  await fireAlert(alert, message, {
    currentAllocation: holding.allocationPercent.toString(),
    target: reference.toString(),
    threshold: threshold.toString(),
  });
  return true;
}

function formatMoney(value: Decimal, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    value.toNumber(),
  );
}
