import { db } from "@/lib/db";
import { resolveActiveForecast } from "@/lib/forecasts";
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
      select: { intendedBuyPrice: true, intendedSellPrice: true },
    }),
    db.trade.findMany({
      where: { instrumentId },
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
