import Decimal from "decimal.js";
import Link from "next/link";
import { Suspense } from "react";
import { StatsRecordSections } from "@/components/stats/stats-record-sections";
import { StatsSkeleton } from "@/components/stats/stats-skeleton";
import { getDashboardSummary } from "@/lib/dashboard";

const ZERO = new Decimal(0);

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
  const [stats, summary] = await Promise.all([
    getPortfolioStats(),
    getDashboardSummary(),
  ]);

  const accountCurrent = summary.totalMarketValueBase.plus(
    summary.totalCashBase,
  );
  const groupCurrent = new Map(
    summary.groupValueBreakdown.map((row) => [row.groupId, row.totalBase]),
  );

  return (
    <div className="flex flex-col gap-16">
      <StatsRecordSections
        stats={stats}
        currentValue={accountCurrent}
        hasMissingPrices={summary.hasMissingPrices}
        recordsDescription="All-time highs and biggest single-day swings across your entire account."
      />

      {stats.groups.length >= 2 ? (
        <div className="flex flex-col gap-16 border-t border-border pt-10">
          <header>
            <p className="label">Allocation buckets</p>
            <h2 className="display mt-2 text-2xl text-foreground">By group</h2>
            <p className="mt-2 max-w-prose text-sm text-muted">
              The same records, scoped to each group&apos;s holdings and cash.
            </p>
          </header>

          {stats.groups.map((group) => (
            <section key={group.groupId} className="flex flex-col gap-10">
              <h3 className="display text-2xl text-foreground">
                <Link
                  href={`/groups/${group.groupId}`}
                  className="hover:text-accent"
                >
                  {group.name}
                </Link>
              </h3>
              <StatsRecordSections
                stats={{ ...group, baseCurrency: stats.baseCurrency }}
                currentValue={groupCurrent.get(group.groupId) ?? ZERO}
                hasMissingPrices={summary.hasMissingPrices}
                compact
              />
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
