import {
  Download,
  Plus,
  Settings as SettingsIcon,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CompositionPanel } from "@/components/composition/composition-panel";
import { RunCompositionButton } from "@/components/composition/run-composition-button";
import { AllocationChartClient } from "@/components/dashboard/allocation-chart-client";
import { GroupAllocationTable } from "@/components/groups/group-allocation-table";
import { GroupPerformanceTable } from "@/components/groups/group-performance-table";
import {
  GroupValueChart,
  GroupValueChartSkeleton,
} from "@/components/groups/group-value-chart";
import {
  PerformanceChart,
  PerformanceChartSkeleton,
} from "@/components/shared/performance-chart";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { computeGroupAllocation } from "@/lib/group-allocation";
import { getGroupPortfolioPerformance } from "@/lib/holding-performance";

type Params = Promise<{ groupId: string }>;

export default function GroupDetailPage({
  params,
}: PageProps<"/groups/[groupId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <GroupDetail params={params} />
    </Suspense>
  );
}

async function GroupDetail({ params }: { params: Params }) {
  const { groupId } = await params;
  const group = await db.portfolioGroup.findUnique({ where: { id: groupId } });
  if (!group) notFound();

  const [allocation, portfolioPerformance] = await Promise.all([
    computeGroupAllocation(groupId),
    getGroupPortfolioPerformance(groupId),
  ]);

  const rowLabelMap = new Map<string, string>();
  for (const r of allocation.rows) {
    if (r.kind === "portfolio") rowLabelMap.set(r.portfolioId, r.name);
  }
  rowLabelMap.set("cash", "Cash");

  const analysis = group.aiCompositionAnalysis as
    | Parameters<typeof CompositionPanel>[0]["analysis"]
    | null;

  const groupSlices = allocation.rows
    .filter((r) => r.actualValueBase.gt(0))
    .map((r) => ({
      key: r.kind === "portfolio" ? r.portfolioId : "cash",
      label: r.kind === "portfolio" ? r.name : "Cash",
      value: Number(r.actualValueBase.toFixed(2)),
      percent: Number(r.actualPercent.toFixed(2)),
      href: r.kind === "portfolio" ? `/portfolios/${r.portfolioId}` : undefined,
    }));

  return (
    <div className="mx-auto max-w-6xl">
      <nav className="label mb-6">
        <Link href="/groups" className="text-muted hover:text-foreground">
          Groups
        </Link>{" "}
        / {group.name}
      </nav>

      <header className="mb-6 flex items-end justify-between border-b border-border pb-6">
        <div>
          <p className="label">Base · {group.baseCurrency}</p>
          <h1 className="display mt-2 text-4xl text-foreground">
            {group.name}
          </h1>
          {group.description ? (
            <p className="mt-2 max-w-prose text-sm text-muted">
              {group.description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/groups/${group.id}/simply-wall-st`}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-muted hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            Simply Wall St
          </a>
          <Link
            href={`/groups/${group.id}/invest`}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-muted hover:text-foreground"
          >
            <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            Invest
          </Link>
          <Link
            href={`/groups/${group.id}/cash`}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            Cash
          </Link>
          <Link
            href={`/groups/${group.id}/settings`}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-muted hover:text-foreground"
          >
            <SettingsIcon
              className="h-3.5 w-3.5"
              strokeWidth={1.5}
              aria-hidden
            />
            Settings
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Total value"
          value={formatCurrency(
            allocation.totalValueBase.toString(),
            allocation.baseCurrency,
          )}
        />
        <Stat
          label="Cash"
          value={formatCurrency(
            allocation.cashBase.toString(),
            allocation.baseCurrency,
          )}
        />
        <Stat
          label="Portfolios"
          value={`${allocation.rows.filter((r) => r.kind === "portfolio").length}`}
        />
      </div>

      {allocation.hasMissingPrices ? (
        <p className="mt-4 text-xs text-warning">
          Some instruments are missing recent prices. Trigger the price cron or
          wait for it to run.
        </p>
      ) : null}

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="display text-2xl text-foreground">Value over time</h2>
        <div className="hairline bg-surface px-5 py-5">
          <Suspense fallback={<GroupValueChartSkeleton />}>
            <GroupValueChart groupId={group.id} days={90} />
          </Suspense>
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="display text-2xl text-foreground">
          Performance vs S&amp;P 500
        </h2>
        <div className="hairline bg-surface px-5 py-5">
          <Suspense fallback={<PerformanceChartSkeleton />}>
            <PerformanceChart scope="group" groupId={group.id} days={90} />
          </Suspense>
        </div>
      </section>

      {groupSlices.length > 0 ? (
        <div className="hairline mt-8 bg-surface px-5 py-5">
          <p className="label mb-4">Actual allocation</p>
          <AllocationChartClient
            slices={groupSlices}
            baseCurrency={allocation.baseCurrency}
          />
        </div>
      ) : null}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="display text-2xl text-foreground">Target vs actual</h2>
        <Link
          href={`/groups/${group.id}/settings`}
          className="text-xs text-muted hover:text-foreground"
        >
          Edit targets
        </Link>
      </div>
      <div className="mt-3">
        <GroupAllocationTable allocation={allocation} />
      </div>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="display text-2xl text-foreground">
          Portfolio performance
        </h2>
        <GroupPerformanceTable performance={portfolioPerformance} />
      </section>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="display text-2xl text-foreground">AI composition</h2>
        <RunCompositionButton scope="group" groupId={group.id} />
      </div>
      <div className="mt-3">
        <CompositionPanel
          analysis={analysis}
          generatedAt={group.aiCompositionGeneratedAt}
          rowLabel={(key) => rowLabelMap.get(key) ?? key}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hairline bg-surface p-5">
      <p className="label">{label}</p>
      <p className="display tabular mt-3 text-2xl text-foreground">{value}</p>
    </div>
  );
}
