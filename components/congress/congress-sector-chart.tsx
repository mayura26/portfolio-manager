import { getSectorBreakdown } from "@/lib/congress-trades";
import { CongressSectorChartClient } from "./congress-sector-chart-client";

export async function CongressSectorChart({
  since,
  minAmount,
  chamber,
}: {
  since: Date;
  minAmount?: number;
  chamber?: string;
}) {
  const data = await getSectorBreakdown(since, minAmount, chamber);
  return <CongressSectorChartClient data={data} />;
}
