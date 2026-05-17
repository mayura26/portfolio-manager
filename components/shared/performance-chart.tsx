import { getAccountPerformance, getGroupPerformance } from "@/lib/performance";
import { PerformanceChartClient } from "./performance-chart-client";

type Props = { days?: number } & (
  | { scope: "account" }
  | { scope: "group"; groupId: string }
);

export async function PerformanceChart(props: Props) {
  const days = props.days ?? 90;
  const data =
    props.scope === "account"
      ? await getAccountPerformance(days)
      : await getGroupPerformance(props.groupId, days);

  return <PerformanceChartClient {...data} />;
}

export function PerformanceChartSkeleton() {
  return (
    <div className="hairline animate-pulse bg-surface p-5">
      <div className="h-80" />
    </div>
  );
}
