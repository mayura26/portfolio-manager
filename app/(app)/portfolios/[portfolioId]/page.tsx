import { Briefcase, Plus, Target } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AllocationTable } from "@/components/portfolios/allocation-table";
import {
  PortfolioValueChart,
  PortfolioValueChartSkeleton,
} from "@/components/portfolios/portfolio-value-chart";
import { EmptyState } from "@/components/shared/empty-state";
import {
  PerformanceChart,
  PerformanceChartSkeleton,
} from "@/components/shared/performance-chart";
import { Skeleton } from "@/components/shared/skeleton";
import { computeGroupCash } from "@/lib/cash";
import { db } from "@/lib/db";
import { formatCurrency, pnlClass } from "@/lib/format";
import { computeHoldings } from "@/lib/holdings";
import { computePortfolioAllocation } from "@/lib/portfolio-allocation";

type Params = Promise<{ portfolioId: string }>;

export default function PortfolioOverviewPage({
  params,
}: PageProps<"/portfolios/[portfolioId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PortfolioOverview params={params} />
    </Suspense>
  );
}

async function PortfolioOverview({ params }: { params: Params }) {
  const { portfolioId } = await params;
  const portfolio = await db.portfolio.findUnique({
    where: { id: portfolioId },
    include: { group: true },
  });
  if (!portfolio) notFound();

  const [holdings, allocation, groupCash] = await Promise.all([
    computeHoldings(portfolioId),
    computePortfolioAllocation(portfolioId),
    computeGroupCash(portfolio.groupId),
  ]);

  if (allocation.rows.length === 0 && holdings.totalRealizedPnL.isZero()) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No holdings or targets yet"
        description="Record a trade or set target weights to populate this portfolio."
        action={{
          href: `/portfolios/${portfolio.id}/trades/new`,
          label: "Record first trade",
        }}
      />
    );
  }

  const targetSumOk =
    Math.abs(Number(allocation.targetSum.toString()) - 100) < 0.0001;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Market value"
          value={formatCurrency(
            holdings.totalMarketValueBase.toString(),
            holdings.baseCurrency,
          )}
        />
        <Stat
          label="Unrealized P&L"
          value={formatCurrency(
            holdings.totalUnrealizedPnL.toString(),
            holdings.baseCurrency,
            { signed: true },
          )}
          tone={pnlClass(holdings.totalUnrealizedPnL.toString())}
        />
        <Stat
          label={`Group cash · ${groupCash.baseCurrency}`}
          value={formatCurrency(
            groupCash.currentCash.toString(),
            groupCash.baseCurrency,
          )}
        />
      </div>

      <p className="text-xs text-muted">
        Group:{" "}
        <Link
          href={`/groups/${portfolio.groupId}`}
          className="hover:text-foreground"
        >
          {portfolio.group.name}
        </Link>{" "}
        · Target weight in group:{" "}
        {Number(portfolio.targetPercentInGroup.toString()).toFixed(2)}%
      </p>

      {holdings.hasMissingPrices ? (
        <p className="text-xs text-warning">
          Some instruments are missing recent prices. Trigger the price cron or
          wait for it to run.
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="display text-2xl text-foreground">
          Market value and cost basis
        </h2>
        <div className="hairline bg-surface px-5 py-5">
          <Suspense fallback={<PortfolioValueChartSkeleton />}>
            <PortfolioValueChart portfolioId={portfolio.id} days={90} />
          </Suspense>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="display text-2xl text-foreground">
          Performance vs S&amp;P 500
        </h2>
        <div className="hairline bg-surface px-5 py-5">
          <Suspense fallback={<PerformanceChartSkeleton />}>
            <PerformanceChart
              scope="portfolio"
              portfolioId={portfolio.id}
              days={90}
            />
          </Suspense>
        </div>
      </section>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="display text-2xl text-foreground">
            Allocation (target vs actual)
          </h2>
          <div className="flex items-center gap-3">
            {!targetSumOk && allocation.rows.some((r) => r.hasTarget) ? (
              <span className="text-xs text-warning">
                Targets sum to{" "}
                {Number(allocation.targetSum.toString()).toFixed(2)}% — fix on
                the Targets tab
              </span>
            ) : null}
            <Link
              href={`/portfolios/${portfolio.id}/targets`}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              <Target className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              Edit targets
            </Link>
            <Link
              href={`/portfolios/${portfolio.id}/trades/new`}
              className="inline-flex items-center gap-2 bg-accent px-3 py-1.5 text-xs text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              Add trade
            </Link>
          </div>
        </div>
        <AllocationTable
          allocation={allocation}
          groupCashBase={groupCash.currentCash.toString()}
          groupBaseCurrency={groupCash.baseCurrency}
        />
        <p className="text-xs text-subtle">
          Realized P&amp;L:{" "}
          {formatCurrency(
            holdings.totalRealizedPnL.toString(),
            holdings.baseCurrency,
            { signed: true },
          )}
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="hairline bg-surface p-5">
      <p className="label">{label}</p>
      <p
        className={`display tabular mt-3 text-2xl ${tone ?? "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}
