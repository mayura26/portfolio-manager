import { StatCard } from "@/components/shared/stat-card";
import { formatDate } from "@/lib/format";
import { getInsiderSummary } from "@/lib/insider-trades";

export async function InsiderSummaryCards({ since }: { since: Date }) {
  const stats = await getInsiderSummary(since);
  const lastSyncLabel = stats.lastSyncAt
    ? formatDate(stats.lastSyncAt)
    : "Never";

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label="Total Trades"
        value={stats.totalTrades.toLocaleString()}
      />
      <StatCard
        label="Tracked Tickers"
        value={stats.uniqueTickers.toLocaleString()}
      />
      <StatCard
        label="Insiders Active"
        value={stats.uniqueInsiders.toLocaleString()}
      />
      <StatCard
        label="Last Sync"
        value={lastSyncLabel}
        delta={
          stats.lastSyncAt
            ? {
                value: stats.lastSyncOk ? "Success" : "Failed",
                tone: stats.lastSyncOk ? "gain" : "loss",
              }
            : undefined
        }
      />
    </div>
  );
}
