import { Suspense } from "react";
import { AchievementRecords } from "@/components/stats/achievement-records";
import { ActivityPanel } from "@/components/stats/activity-panel";
import { PositionRecords } from "@/components/stats/position-records";
import { StatsSkeleton } from "@/components/stats/stats-skeleton";

export default function StatsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      <header className="border-b border-border pb-6">
        <p className="label">Personal bests</p>
        <h1 className="display mt-2 text-4xl text-foreground">Stats</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          All-time portfolio records, top positions, and trading activity.
        </p>
      </header>

      <Suspense fallback={<StatsSkeleton />}>
        <StatsContent />
      </Suspense>
    </div>
  );
}

async function StatsContent() {
  const { getPortfolioStats } = await import("@/lib/stats");
  const stats = await getPortfolioStats();

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="display text-2xl text-foreground">Portfolio records</h2>
        <p className="text-sm text-muted">
          All-time highs and biggest single-day swings across your entire account.
        </p>
        <AchievementRecords stats={stats} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="display text-2xl text-foreground">Position hall of fame</h2>
        <p className="text-sm text-muted">
          Your best and worst positions, by unrealized and realized P&amp;L.
        </p>
        <PositionRecords stats={stats} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="display text-2xl text-foreground">Activity</h2>
        <ActivityPanel stats={stats} />
      </section>
    </div>
  );
}
