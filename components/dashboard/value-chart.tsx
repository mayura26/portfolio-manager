import { GroupValueChartClient } from "@/components/groups/group-value-chart-client";
import { getValueHistoryByGroup } from "@/lib/dashboard";

type Props = {
  days?: number;
};

export async function ValueChart({ days = 90 }: Props) {
  const data = await getValueHistoryByGroup(days);

  const points = data.points.map((row) => {
    const out: Record<string, string | number> = {
      date: row.date.toISOString(),
    };
    for (const s of data.series) {
      const v = row[s.key];
      // The benchmark line has no value before its anchor date — leave the
      // key unset so the line starts cleanly instead of dropping to zero.
      if (typeof v === "number") out[s.key] = v;
    }
    return out;
  });

  return (
    <GroupValueChartClient
      baseCurrency={data.baseCurrency}
      series={data.series}
      points={points}
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
