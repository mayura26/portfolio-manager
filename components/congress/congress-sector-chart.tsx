import { getSectorBreakdown } from "@/lib/congress-trades";
import { CongressSectorChartClient } from "./congress-sector-chart-client";

export async function CongressSectorChart({
  since,
  minAmount,
}: {
  since: Date;
  minAmount?: number;
}) {
  const data = await getSectorBreakdown(since, minAmount);
  return <CongressSectorChartClient data={data} />;
}
