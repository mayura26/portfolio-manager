import { Briefcase, Plus, Target } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AllocationTable } from "@/components/portfolios/allocation-table";
import { HoldingPerformanceTable } from "@/components/portfolios/holding-performance-table";
import {
  PortfolioValueChart,
  PortfolioValueChartSkeleton,
} from "@/components/portfolios/portfolio-value-chart";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { computeGroupCash } from "@/lib/cash";
import { db } from "@/lib/db";
import { formatCurrency, pnlClass } from "@/lib/format";
import { getPortfolioHoldingPerformance } from "@/lib/holding-performance";
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

  const [holdings, allocation, groupCash, holdingPerformance] =
    await Promise.all([
      computeHoldings(portfolioId),
      computePortfolioAllocation(portfolioId),
      computeGroupCash(portfolio.groupId),
      getPortfolioHoldingPerformance(portfolioId),
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

  const targetRangeOk =
    Number(allocation.targetMinSum.toString()) <= 100.0001 &&
    Number(allocation.targetMaxSum.toString()) >= 99.9999;

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
          label={`Group pure cash · ${groupCash.baseCurrency}`}
          value={formatCurrency(
            groupCash.pureCash.toString(),
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
        {formatRange(
          portfolio.targetMinPercentInGroup.toString(),
          portfolio.targetMaxPercentInGroup.toString(),
        )}
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

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="display text-2xl text-foreground">
            Allocation (target vs actual)
          </h2>
          <div className="flex items-center gap-3">
            {!targetRangeOk && allocation.rows.some((r) => r.hasTarget) ? (
              <span className="text-xs text-warning">
                Target ranges do not include 100% - fix on the Targets tab
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
          groupCashBase={groupCash.pureCash.toString()}
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

      <section className="flex flex-col gap-3">
        <h2 className="display text-2xl text-foreground">
          Holding performance
        </h2>
        <HoldingPerformanceTable performance={holdingPerformance} />
      </section>
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

function formatRange(min: string, max: string) {
  if (Math.abs(Number(min) - Number(max)) < 0.0001) {
    return `${Number(min).toFixed(2)}%`;
  }
  return `${Number(min).toFixed(2)}%-${Number(max).toFixed(2)}%`;
}
