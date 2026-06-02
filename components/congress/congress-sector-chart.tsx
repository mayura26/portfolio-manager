import { getSectorBreakdown } from "@/lib/congress-trades";
import { CongressSectorChartClient } from "./congress-sector-chart-client";

export async function CongressSectorChart({ since }: { since: Date }) {
  const data = await getSectorBreakdown(since);
  return <CongressSectorChartClient data={data} />;
}
