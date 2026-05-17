import { Suspense } from "react";
import {
  AllocationChart,
  AllocationChartSkeleton,
} from "@/components/dashboard/allocation-chart";
import {
  PortfolioSummaryList,
  PortfolioSummaryListSkeleton,
} from "@/components/dashboard/portfolio-summary-list";
import {
  ReviewsSummary,
  ReviewsSummarySkeleton,
} from "@/components/dashboard/reviews-summary";
import { SignalsPanel } from "@/components/dashboard/signals-panel";
import {
  SummaryCards,
  SummaryCardsSkeleton,
} from "@/components/dashboard/summary-cards";
import {
  TopMovers,
  TopMoversSkeleton,
} from "@/components/dashboard/top-movers";
import {
  ValueChart,
  ValueChartSkeleton,
} from "@/components/dashboard/value-chart";
import {
  PerformanceChart,
  PerformanceChartSkeleton,
} from "@/components/shared/performance-chart";
import { Skeleton } from "@/components/shared/skeleton";

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      <header className="border-b border-border pb-6">
        <p className="label">Today</p>
        <h1 className="display mt-2 text-4xl text-foreground">Dashboard</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Aggregate value, performance, and movement across every portfolio.
        </p>
      </header>

      <Suspense fallback={<SummaryCardsSkeleton />}>
        <SummaryCards />
      </Suspense>

      <section className="flex flex-col gap-3">
        <h2 className="display text-2xl text-foreground">Value over time</h2>
        <Suspense fallback={<ValueChartSkeleton />}>
          <ValueChart days={90} />
        </Suspense>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="display text-2xl text-foreground">
          Performance vs S&amp;P 500
        </h2>
        <Suspense fallback={<PerformanceChartSkeleton />}>
          <PerformanceChart scope="account" days={90} />
        </Suspense>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="display text-2xl text-foreground">Allocation</h2>
          <Suspense fallback={<AllocationChartSkeleton />}>
            <AllocationChart groupBy="portfolio" />
          </Suspense>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="display text-2xl text-foreground">Top movers</h2>
          <Suspense fallback={<TopMoversSkeleton />}>
            <TopMovers />
          </Suspense>
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="display text-2xl text-foreground">Signals</h2>
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <SignalsPanel />
        </Suspense>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="display text-2xl text-foreground">Portfolios</h2>
          <Suspense fallback={<PortfolioSummaryListSkeleton />}>
            <PortfolioSummaryList />
          </Suspense>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="display text-2xl text-foreground">Reviews</h2>
          <Suspense fallback={<ReviewsSummarySkeleton />}>
            <ReviewsSummary />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
