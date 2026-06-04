import { Suspense } from "react";
import { InsiderFiltersBar } from "@/components/insiders/insider-filters-bar";
import { InsiderSummaryCards } from "@/components/insiders/insider-summary-cards";
import { InsiderTradesTable } from "@/components/insiders/insider-trades-table";
import { Skeleton } from "@/components/shared/skeleton";
import { insiderFiltersSchema } from "@/lib/validators";

type SearchParams = Promise<Record<string, string>>;

export default function InsidersTab({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<InsidersSkeleton />}>
      <InsidersTabContent searchParams={searchParams} />
    </Suspense>
  );
}

async function InsidersTabContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const filters = insiderFiltersSchema.parse(raw);
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
        <InsiderSummaryCards since={since} />
      </Suspense>

      <div>
        <div className="border-b border-border pb-3">
          <h2 className="text-sm font-medium text-foreground">
            Form 4 Transactions
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Limited to companies you hold or watch.
          </p>
        </div>
        <div className="mt-4">
          <InsiderFiltersBar filters={filters} />
        </div>
        <Suspense fallback={<Skeleton className="mt-4 h-96" />}>
          <div className="mt-4">
            <InsiderTradesTable filters={filters} />
          </div>
        </Suspense>
      </div>
    </div>
  );
}

function InsidersSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
