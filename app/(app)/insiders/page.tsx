import { Building2, Landmark } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { InsiderFiltersBar } from "@/components/insiders/insider-filters-bar";
import { InsiderSummaryCards } from "@/components/insiders/insider-summary-cards";
import { InsiderTradesTable } from "@/components/insiders/insider-trades-table";
import { Skeleton } from "@/components/shared/skeleton";
import { CrossSourceLeaderboard } from "@/components/signals/cross-source-leaderboard";
import { insiderFiltersSchema } from "@/lib/validators";

type SearchParams = Promise<Record<string, string>>;

export default function InsidersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="label">Intelligence</p>
          <h1 className="display mt-2 text-4xl text-foreground">
            <span className="inline-flex items-center gap-3">
              <Building2 className="h-8 w-8 text-muted" strokeWidth={1} />
              Insider Trades
            </span>
          </h1>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Corporate insider buys and sells from SEC Form 4 filings, limited to
            companies you hold or watch.
          </p>
        </div>
        <Link
          href="/congress"
          className="hairline inline-flex shrink-0 items-center gap-2 bg-surface px-3 py-1.5 text-xs text-foreground hover:border-border-strong"
        >
          <Landmark className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          Government trades
        </Link>
      </header>

      <Suspense fallback={<InsidersPageSkeleton />}>
        <InsidersContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function InsidersContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const filters = insiderFiltersSchema.parse(raw);
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
        <InsiderSummaryCards since={since} />
      </Suspense>

      <div className="mt-8">
        <Suspense fallback={<Skeleton className="h-64" />}>
          <CrossSourceLeaderboard since={since} />
        </Suspense>
      </div>

      <div className="mt-8">
        <div className="border-b border-border pb-3">
          <h2 className="text-sm font-medium text-foreground">
            Form 4 Transactions
          </h2>
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
    </>
  );
}

function InsidersPageSkeleton() {
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
