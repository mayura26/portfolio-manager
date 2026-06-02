import { StatCard } from "@/components/shared/stat-card";
import { getSummaryStats } from "@/lib/congress-trades";
import { formatDate } from "@/lib/format";

export async function CongressSummaryCards({ since }: { since: Date }) {
  const stats = await getSummaryStats(since);

  const lastSyncLabel = stats.lastSyncAt
    ? formatDate(stats.lastSyncAt)
    : "Never";

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Total Trades" value={stats.totalTrades.toLocaleString()} />
      <StatCard label="Unique Tickers" value={stats.uniqueTickers.toLocaleString()} />
      <StatCard label="Politicians Active" value={stats.uniquePoliticians.toLocaleString()} />
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
