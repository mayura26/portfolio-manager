import { Landmark } from "lucide-react";
import { Suspense } from "react";
import { CongressSyncButton } from "@/components/congress/congress-sync-button";
import { CongressSummaryCards } from "@/components/congress/congress-summary-cards";
import { TopTradesTable } from "@/components/congress/top-trades-table";
import { CongressSectorChart } from "@/components/congress/congress-sector-chart";
import { CongressFiltersSection } from "@/components/congress/congress-filters-section";
import { CongressTradesTable } from "@/components/congress/congress-trades-table";
import { Skeleton } from "@/components/shared/skeleton";
import { congressFiltersSchema } from "@/lib/validators";

type SearchParams = Promise<Record<string, string>>;

// Page is not async — searchParams is passed as a Promise to child components
export default function CongressPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-end justify-between border-b border-border pb-6">
        <div>
          <p className="label">Intelligence</p>
          <h1 className="display mt-2 text-4xl text-foreground">
            <span className="inline-flex items-center gap-3">
              <Landmark className="h-8 w-8 text-muted" strokeWidth={1} />
              Congress Trades
            </span>
          </h1>
          <p className="mt-2 max-w-prose text-sm text-muted">
            House Periodic Transaction Reports — STOCK Act disclosures from
            disclosures.house.gov. Spot clusters where multiple members are
            buying or selling the same stock.
          </p>
        </div>
        <CongressSyncButton />
      </header>

      <Suspense fallback={<CongressPageSkeleton />}>
        <CongressContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CongressContent({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const filters = congressFiltersSchema.parse(raw);
  const since = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000);

  return (
    <>
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

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<Skeleton className="h-64" />}>
          <TopTradesTable type="buy" since={since} sector={filters.sector} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-64" />}>
          <TopTradesTable type="sell" since={since} sector={filters.sector} />
        </Suspense>
      </div>

      <div className="mt-8">
        <div className="hairline bg-surface">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-medium text-foreground">
              Sector Breakdown
            </h2>
            <p className="mt-0.5 text-xs text-muted">Buys vs. sells by sector</p>
          </div>
          <div className="p-5">
            <Suspense fallback={<Skeleton className="h-64" />}>
              <CongressSectorChart since={since} />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="mt-8">
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
    </>
  );
}

function CongressPageSkeleton() {
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
