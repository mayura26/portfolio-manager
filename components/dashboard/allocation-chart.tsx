import { type AllocationGroupBy, getAllocation } from "@/lib/dashboard";
import { AllocationChartClient } from "./allocation-chart-client";

type Props = {
  groupBy?: AllocationGroupBy;
};

export async function AllocationChart({ groupBy = "portfolio" }: Props) {
  const data = await getAllocation(groupBy);

  return (
    <AllocationChartClient
      baseCurrency={data.baseCurrency}
      slices={data.slices.map((s) => ({
        key: s.key,
        label: s.label,
        value: Number(s.value.toFixed(2)),
        percent: Number(s.percent.toFixed(2)),
      }))}
    />
  );
}

export function AllocationChartSkeleton() {
  return (
    <div className="hairline animate-pulse bg-surface p-5">
      <div className="h-72" />
    </div>
  );
}
