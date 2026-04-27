import { fetchDailyHistory } from "@/lib/yahoo";
import { PriceChartClient } from "./price-chart-client";

type Props = {
  yahooSymbol: string;
  currency: string;
  days?: number;
};

export async function PriceChart({ yahooSymbol, currency, days = 180 }: Props) {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - days);

  let bars: Awaited<ReturnType<typeof fetchDailyHistory>> = [];
  try {
    bars = await fetchDailyHistory(yahooSymbol, from);
  } catch {
    // ignore — render empty state below
  }

  return (
    <PriceChartClient
      currency={currency}
      points={bars.map((b) => ({ date: b.date.toISOString(), close: b.close }))}
    />
  );
}

export function PriceChartSkeleton() {
  return (
    <div className="hairline animate-pulse bg-surface p-5">
      <div className="h-72" />
    </div>
  );
}
