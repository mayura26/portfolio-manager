import {
  getCrossSourceTopTickers,
  getSmartMoneyForTickers,
} from "@/lib/trade-signals";
import { LeaderboardCard } from "./leaderboard-card";

type Props = {
  since: Date;
  limit?: number;
};

export async function CrossSourceLeaderboard({ since, limit = 15 }: Props) {
  const rows = await getCrossSourceTopTickers({ since, limit });
  const detail = await getSmartMoneyForTickers(
    rows.map((r) => r.ticker),
    since,
  );

  return (
    <div className="hairline bg-surface">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-foreground">
          Cross-source activity
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          Where Congress &amp; corporate insiders overlap — ranked by combined
          breadth and dollar size. Tap a row to expand the trades.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted">
          Populates once trade syncs have run.
        </p>
      ) : (
        <div>
          {rows.map((row) => (
            <LeaderboardCard
              key={row.ticker}
              row={row}
              trades={detail.get(row.ticker) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
