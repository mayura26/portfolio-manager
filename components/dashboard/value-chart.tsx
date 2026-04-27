import { getValueHistory } from "@/lib/dashboard";
import { ValueChartClient } from "./value-chart-client";

type Props = {
  days?: number;
};

export async function ValueChart({ days = 90 }: Props) {
  const data = await getValueHistory(days);

  return (
    <ValueChartClient
      baseCurrency={data.baseCurrency}
      points={data.points.map((p) => ({
        date: p.date.toISOString(),
        value: p.value,
      }))}
    />
  );
}

export function ValueChartSkeleton() {
  return (
    <div className="hairline animate-pulse bg-surface p-5">
      <div className="h-72" />
    </div>
  );
}
