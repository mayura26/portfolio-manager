import type Decimal from "decimal.js";
import { AchievementRecords } from "@/components/stats/achievement-records";
import { ActivityPanel } from "@/components/stats/activity-panel";
import { PositionRecords } from "@/components/stats/position-records";
import type { StatsView } from "@/lib/stats";

type Props = {
  stats: StatsView;
  currentValue: Decimal;
  hasMissingPrices: boolean;
  recordsDescription?: string;
  compact?: boolean;
};

export function StatsRecordSections({
  stats,
  currentValue,
  hasMissingPrices,
  recordsDescription,
  compact = false,
}: Props) {
  const Heading = compact ? "h3" : "h2";
  const headingClass = compact
    ? "text-sm font-medium text-foreground"
    : "display text-2xl text-foreground";

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <Heading className={headingClass}>Portfolio records</Heading>
        {recordsDescription ? (
          <p className="text-sm text-muted">{recordsDescription}</p>
        ) : null}
        <AchievementRecords
          stats={stats}
          currentValue={currentValue}
          hasMissingPrices={hasMissingPrices}
        />
      </section>

      <section className="flex flex-col gap-4">
        <Heading className={headingClass}>Position hall of fame</Heading>
        {compact ? null : (
          <p className="text-sm text-muted">
            Your best and worst positions, by unrealized and realized P&amp;L.
          </p>
        )}
        <PositionRecords stats={stats} />
      </section>

      <section className="flex flex-col gap-4">
        <Heading className={headingClass}>Activity</Heading>
        <ActivityPanel stats={stats} />
      </section>
    </div>
  );
}
