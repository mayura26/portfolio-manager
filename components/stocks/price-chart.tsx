import {
  fetchPriceChartHistory,
  PRICE_CHART_RANGES,
  type PriceChartRange,
} from "@/lib/yahoo";
import { PriceChartClient } from "./price-chart-client";

type Props = {
  yahooSymbol: string;
  currency: string;
  range?: PriceChartRange;
};

export async function PriceChart({
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

  return <PriceChartClient bars={bars} currency={currency} range={range} />;
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
