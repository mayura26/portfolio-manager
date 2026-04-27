import { Suspense } from "react";
import { LineChart } from "lucide-react";
import { db } from "@/lib/db";
import { StockCard } from "@/components/stocks/stock-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";

export default function StocksPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 border-b border-border pb-6">
        <p className="label">Universe</p>
        <h1 className="display mt-2 text-4xl text-foreground">Stocks</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Every instrument referenced by a trade. Click through for research, financials, and notes.
        </p>
      </header>

      <Suspense fallback={<StocksGridSkeleton />}>
        <StocksGrid />
      </Suspense>
    </div>
  );
}

async function StocksGrid() {
  const instruments = await db.instrument.findMany({
    orderBy: { symbol: "asc" },
  });

  if (instruments.length === 0) {
    return (
      <EmptyState
        icon={LineChart}
        title="No instruments yet"
        description="Record a trade in any portfolio to start tracking the underlying instrument here."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {instruments.map((i) => (
        <StockCard key={i.id} instrument={i} />
      ))}
    </div>
  );
}

function StocksGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-32" />
      ))}
    </div>
  );
}
