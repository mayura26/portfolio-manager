import { getGroupValueHistory } from "@/lib/dashboard";
import { GroupValueChartClient } from "./group-value-chart-client";

type Props = {
  groupId: string;
  days?: number;
};

export async function GroupValueChart({ groupId, days = 90 }: Props) {
  const data = await getGroupValueHistory(groupId, days);

  const points = data.points.map((row) => {
    const out: Record<string, string | number> = {
      date: row.date.toISOString(),
    };
    for (const s of data.series) {
      const v = row[s.key];
      if (typeof v === "number") out[s.key] = v;
      else out[s.key] = 0;
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

export function GroupValueChartSkeleton() {
  return (
    <div className="hairline animate-pulse bg-surface p-5">
      <div className="h-80" />
    </div>
  );
}
