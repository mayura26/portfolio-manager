import { Suspense } from "react";
import { CongressFiltersSection } from "@/components/congress/congress-filters-section";
import { CongressSectorChart } from "@/components/congress/congress-sector-chart";
import { CongressSummaryCards } from "@/components/congress/congress-summary-cards";
import { CongressTradesTable } from "@/components/congress/congress-trades-table";
import { TopTradesTable } from "@/components/congress/top-trades-table";
import { Skeleton } from "@/components/shared/skeleton";
import { congressFiltersSchema } from "@/lib/validators";

type SearchParams = Promise<Record<string, string>>;

export default function GovernmentTab({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<GovernmentSkeleton />}>
      <GovernmentContent searchParams={searchParams} />
    </Suspense>
  );
}

async function GovernmentContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const filters = congressFiltersSchema.parse(raw);
  const since = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000);

  return (
    <div className="flex flex-col gap-8">
      <Suspense
        fallback={
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        }
      >
        <CongressSummaryCards since={since} />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<Skeleton className="h-64" />}>
          <TopTradesTable
            type="buy"
            since={since}
            sector={filters.sector}
            minAmount={filters.minAmount}
            chamber={filters.chamber}
          />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-64" />}>
          <TopTradesTable
            type="sell"
            since={since}
            sector={filters.sector}
            minAmount={filters.minAmount}
            chamber={filters.chamber}
          />
        </Suspense>
      </div>

      <div className="hairline bg-surface">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-medium text-foreground">
            Sector Breakdown
          </h2>
          <p className="mt-0.5 text-xs text-muted">Buys vs. sells by sector</p>
        </div>
        <div className="p-5">
          <Suspense fallback={<Skeleton className="h-64" />}>
            <CongressSectorChart
              since={since}
              minAmount={filters.minAmount}
              chamber={filters.chamber}
            />
          </Suspense>
        </div>
      </div>

      <div>
        <div className="border-b border-border pb-3">
          <h2 className="text-sm font-medium text-foreground">
            All Disclosures
          </h2>
        </div>
        <Suspense fallback={<Skeleton className="h-10" />}>
          <CongressFiltersSection filters={filters} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-96" />}>
          <CongressTradesTable filters={filters} />
        </Suspense>
      </div>
    </div>
  );
}

function GovernmentSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-80" />
      <Skeleton className="h-96" />
    </div>
  );
}
