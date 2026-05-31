import { db } from "@/lib/db";
import { resolveActiveForecast } from "@/lib/forecasts";
import { visibleTradeWhere } from "@/lib/portfolio-visibility";
import { aggregateOpenPositions } from "@/lib/signals";
import {
  fetchPriceChartHistory,
  PRICE_CHART_RANGES,
  type PriceChartRange,
} from "@/lib/yahoo";
import type {
  ChartForecast,
  ChartPriceTarget,
  ChartTradeMarker,
} from "./price-chart-client";
import { PriceChartClient } from "./price-chart-client";

type Props = {
  instrumentId: string;
  yahooSymbol: string;
  currency: string;
  range?: PriceChartRange;
};

export async function PriceChart({
  instrumentId,
  yahooSymbol,
  currency,
  range = "6m",
}: Props) {
  let bars: Awaited<ReturnType<typeof fetchPriceChartHistory>> = [];
  try {
    bars = await fetchPriceChartHistory(yahooSymbol, range);
  } catch {
    // Render the empty state below when Yahoo history is unavailable.
  }

  const [forecastRow, targets, trades, targetAlerts] = await Promise.all([
    resolveActiveForecast(instrumentId),
    db.portfolioTarget.findMany({
      where: { instrumentId },
      select: {
        intendedBuyPrice: true,
        intendedSellPrice: true,
        trimAtGainPercent: true,
      },
    }),
    db.trade.findMany({
      where: { instrumentId, ...visibleTradeWhere },
      select: { type: true, price: true, quantity: true, date: true },
      orderBy: { date: "asc" },
    }),
    db.alert.findMany({
      where: {
        instrumentId,
        status: "ACTIVE",
        type: { in: ["PRICE_ABOVE", "PRICE_BELOW"] },
      },
      select: { id: true, type: true, priceTarget: true },
    }),
  ]);

  const forecast: ChartForecast | null = forecastRow
    ? {
        source: forecastRow.source,
        isPinned: forecastRow.isPinned,
        targetPrice: Number(forecastRow.targetPrice),
        lowCase: forecastRow.lowCase ? Number(forecastRow.lowCase) : null,
        highCase: forecastRow.highCase ? Number(forecastRow.highCase) : null,
        streetTargetMean: forecastRow.streetTargetMean
          ? Number(forecastRow.streetTargetMean)
          : null,
      }
    : null;

  const userBuy = maxDecimal(targets.map((t) => t.intendedBuyPrice));
  const userSell = maxDecimal(targets.map((t) => t.intendedSellPrice));

  // Trim is a % gain on cost — convert to a price line using the blended
  // average cost across every position in this instrument.
  const trimGainPercent = maxDecimal(targets.map((t) => t.trimAtGainPercent));
  const position = (await aggregateOpenPositions()).find(
    (p) => p.instrumentId === instrumentId,
  );
  const avgCost =
    position && !position.quantity.isZero()
      ? position.costBase.dividedBy(position.quantity).toNumber()
      : null;
  const userTrim =
    trimGainPercent != null && avgCost != null
      ? avgCost * (1 + trimGainPercent / 100)
      : null;

  const tradeMarkers: ChartTradeMarker[] = trades.map((t) => ({
    time: Math.floor(t.date.getTime() / 1000),
    type: t.type,
    price: Number(t.price),
    quantity: Number(t.quantity),
  }));

  const priceTargets: ChartPriceTarget[] = targetAlerts
    .filter((a) => a.priceTarget != null)
    .map((a) => ({
      id: a.id,
      kind: a.type === "PRICE_ABOVE" ? "sell" : "buy",
      price: Number(a.priceTarget),
    }));

  return (
    <PriceChartClient
      bars={bars}
      currency={currency}
      range={range}
      forecast={forecast}
      userBuyPrice={userBuy}
      userSellPrice={userSell}
      userTrimPrice={userTrim}
      trades={tradeMarkers}
      priceTargets={priceTargets}
    />
  );
}

function maxDecimal(values: ({ toString(): string } | null)[]): number | null {
  const nums = values
    .filter((v): v is { toString(): string } => v != null)
    .map((v) => Number(v.toString()))
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

export function PriceChartSkeleton() {
  return (
    <div className="hairline animate-pulse bg-surface p-5">
      <div className="h-72" />
    </div>
  );
}

export function parsePriceChartRange(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return PRICE_CHART_RANGES.includes(candidate as PriceChartRange)
    ? (candidate as PriceChartRange)
    : "6m";
}
