import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { resolveActiveForecast } from "@/lib/forecasts";
import { computeHoldings, type Holding } from "@/lib/holdings";

const APPROACHING_BAND = new Decimal(3); // within 3% of a threshold

export type SignalKind =
  | "TARGET_HIT"
  | "BULL_HIT"
  | "STREET_TARGET_HIT"
  | "SELF_SELL_HIT"
  | "GAIN_THRESHOLD"
  | "APPROACHING_TARGET"
  | "APPROACHING_BULL"
  | "APPROACHING_SELF_SELL";

export type SellSignal = {
  kind: SignalKind;
  instrumentId: string;
  yahooSymbol: string;
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number;
  thresholdPrice: number | null;
  unrealizedGainPercent: number | null;
  quantity: number;
  // Priority: higher = more urgent. Used to sort the panel.
  priority: number;
  reason: string;
};

type AggregatePosition = {
  instrumentId: string;
  yahooSymbol: string;
  symbol: string;
  name: string;
  currency: string;
  quantity: Decimal;
  costBase: Decimal;
  marketPrice: Decimal | null;
  marketValueBase: Decimal | null;
  unrealizedPnLPercent: Decimal | null;
};

export async function computeSellSignals(opts?: {
  portfolioId?: string;
  instrumentId?: string;
}): Promise<SellSignal[]> {
  const positions = await aggregateOpenPositions(opts?.portfolioId);
  const filtered = opts?.instrumentId
    ? positions.filter((p) => p.instrumentId === opts.instrumentId)
    : positions;
  if (filtered.length === 0) return [];

  const settings = await db.settings.findUnique({ where: { id: "singleton" } });
  const gainThresholdDefault = settings?.sellSignalGainPercent
    ? new Decimal(settings.sellSignalGainPercent.toString())
    : new Decimal(25);

  const instrumentIds = filtered.map((p) => p.instrumentId);

  const [forecasts, targets] = await Promise.all([
    Promise.all(instrumentIds.map((id) => resolveActiveForecast(id))),
    db.portfolioTarget.findMany({
      where: { instrumentId: { in: instrumentIds } },
      select: {
        instrumentId: true,
        intendedSellPrice: true,
        trimAtGainPercent: true,
      },
    }),
  ]);

  const forecastByInstrument = new Map(
    forecasts
      .filter((f): f is NonNullable<typeof f> => f != null)
      .map((f) => [f.instrumentId, f] as const),
  );
  const targetsByInstrument = new Map<
    string,
    { sellPrice: Decimal | null; trimGain: Decimal | null }
  >();
  for (const t of targets) {
    const prev = targetsByInstrument.get(t.instrumentId);
    const sellPrice = t.intendedSellPrice
      ? new Decimal(t.intendedSellPrice.toString())
      : null;
    const trimGain = t.trimAtGainPercent
      ? new Decimal(t.trimAtGainPercent.toString())
      : null;
    targetsByInstrument.set(t.instrumentId, {
      sellPrice: maxDec(prev?.sellPrice ?? null, sellPrice),
      trimGain: maxDec(prev?.trimGain ?? null, trimGain),
    });
  }

  const signals: SellSignal[] = [];

  for (const pos of filtered) {
    if (!pos.marketPrice) continue;
    const price = pos.marketPrice;

    const forecast = forecastByInstrument.get(pos.instrumentId);
    const targetsForPos = targetsByInstrument.get(pos.instrumentId);

    const base = {
      instrumentId: pos.instrumentId,
      yahooSymbol: pos.yahooSymbol,
      symbol: pos.symbol,
      name: pos.name,
      currency: pos.currency,
      currentPrice: price.toNumber(),
      unrealizedGainPercent: pos.unrealizedPnLPercent?.toNumber() ?? null,
      quantity: pos.quantity.toNumber(),
    };

    if (forecast?.targetPrice) {
      const target = new Decimal(forecast.targetPrice.toString());
      if (price.gte(target)) {
        signals.push({
          ...base,
          kind: "TARGET_HIT",
          thresholdPrice: target.toNumber(),
          priority: 4,
          reason: `Hit forecast target ${target.toFixed(2)}`,
        });
      } else if (withinBand(price, target)) {
        signals.push({
          ...base,
          kind: "APPROACHING_TARGET",
          thresholdPrice: target.toNumber(),
          priority: 2,
          reason: `Within 3% of target ${target.toFixed(2)}`,
        });
      }
    }

    if (forecast?.highCase) {
      const bull = new Decimal(forecast.highCase.toString());
      if (price.gte(bull)) {
        signals.push({
          ...base,
          kind: "BULL_HIT",
          thresholdPrice: bull.toNumber(),
          priority: 5,
          reason: `Hit bull case ${bull.toFixed(2)}`,
        });
      } else if (withinBand(price, bull)) {
        signals.push({
          ...base,
          kind: "APPROACHING_BULL",
          thresholdPrice: bull.toNumber(),
          priority: 2,
          reason: `Within 3% of bull case ${bull.toFixed(2)}`,
        });
      }
    }

    if (forecast?.streetTargetMean) {
      const street = new Decimal(forecast.streetTargetMean.toString());
      if (price.gte(street)) {
        signals.push({
          ...base,
          kind: "STREET_TARGET_HIT",
          thresholdPrice: street.toNumber(),
          priority: 3,
          reason: `Hit street consensus ${street.toFixed(2)}`,
        });
      }
    }

    if (targetsForPos?.sellPrice) {
      const sellPrice = targetsForPos.sellPrice;
      if (price.gte(sellPrice)) {
        signals.push({
          ...base,
          kind: "SELF_SELL_HIT",
          thresholdPrice: sellPrice.toNumber(),
          priority: 5,
          reason: `Hit your sell price ${sellPrice.toFixed(2)}`,
        });
      } else if (withinBand(price, sellPrice)) {
        signals.push({
          ...base,
          kind: "APPROACHING_SELF_SELL",
          thresholdPrice: sellPrice.toNumber(),
          priority: 3,
          reason: `Within 3% of your sell price ${sellPrice.toFixed(2)}`,
        });
      }
    }

    const gainThreshold = targetsForPos?.trimGain ?? gainThresholdDefault;
    if (pos.unrealizedPnLPercent?.gte(gainThreshold)) {
      signals.push({
        ...base,
        kind: "GAIN_THRESHOLD",
        thresholdPrice: null,
        priority: 3,
        reason: `Up ${pos.unrealizedPnLPercent.toFixed(1)}% (threshold ${gainThreshold.toFixed(0)}%)`,
      });
    }
  }

  return signals.sort((a, b) => b.priority - a.priority);
}

function withinBand(price: Decimal, threshold: Decimal): boolean {
  if (threshold.lte(0)) return false;
  const distance = threshold.minus(price).abs().dividedBy(threshold).times(100);
  return price.lt(threshold) && distance.lte(APPROACHING_BAND);
}

function maxDec(a: Decimal | null, b: Decimal | null): Decimal | null {
  if (!a) return b;
  if (!b) return a;
  return a.gte(b) ? a : b;
}

async function aggregateOpenPositions(
  portfolioId?: string,
): Promise<AggregatePosition[]> {
  const portfolios = portfolioId
    ? [{ id: portfolioId }]
    : await db.portfolio.findMany({ select: { id: true } });

  const byInstrument = new Map<string, AggregatePosition>();

  for (const p of portfolios) {
    let snapshot: Awaited<ReturnType<typeof computeHoldings>>;
    try {
      snapshot = await computeHoldings(p.id);
    } catch {
      continue;
    }
    for (const h of snapshot.holdings) {
      mergeHolding(byInstrument, h);
    }
  }

  return Array.from(byInstrument.values());
}

function mergeHolding(map: Map<string, AggregatePosition>, h: Holding): void {
  const existing = map.get(h.instrumentId);
  if (!existing) {
    map.set(h.instrumentId, {
      instrumentId: h.instrumentId,
      yahooSymbol: h.yahooSymbol,
      symbol: h.symbol,
      name: h.name,
      currency: h.currency,
      quantity: h.quantity,
      costBase: h.costBase,
      marketPrice: h.marketPrice,
      marketValueBase: h.marketValueBase,
      unrealizedPnLPercent: h.unrealizedPnLPercent,
    });
    return;
  }

  const newQuantity = existing.quantity.plus(h.quantity);
  const newCostBase = existing.costBase.plus(h.costBase);
  const newMarketValueBase =
    h.marketValueBase && existing.marketValueBase
      ? existing.marketValueBase.plus(h.marketValueBase)
      : (h.marketValueBase ?? existing.marketValueBase);

  const newPnLPercent =
    newMarketValueBase && !newCostBase.isZero()
      ? newMarketValueBase.minus(newCostBase).dividedBy(newCostBase).times(100)
      : null;

  map.set(h.instrumentId, {
    ...existing,
    quantity: newQuantity,
    costBase: newCostBase,
    // Market price is the same per instrument; keep first non-null
    marketPrice: existing.marketPrice ?? h.marketPrice,
    marketValueBase: newMarketValueBase,
    unrealizedPnLPercent: newPnLPercent,
  });
}
