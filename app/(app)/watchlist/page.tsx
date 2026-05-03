import { Suspense } from "react";
import Link from "next/link";
import { Bookmark, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { fetchQuotes } from "@/lib/yahoo";
import { WatchlistCard } from "@/components/watchlist/watchlist-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";

export default function WatchlistPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-end justify-between border-b border-border pb-6">
        <div>
          <p className="label">Portfolio</p>
          <h1 className="display mt-2 text-4xl text-foreground">Watchlist</h1>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Stocks you want to buy when the price is right. Set a buy zone to get alerted.
          </p>
        </div>
        <Link
          href="/watchlist/new"
          className="inline-flex items-center gap-2 bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          Add stock
        </Link>
      </header>

      <Suspense fallback={<WatchlistGridSkeleton />}>
        <WatchlistGrid />
      </Suspense>

      <Suspense fallback={null}>
        <ArchivedSection />
      </Suspense>
    </div>
  );
}

async function WatchlistGrid() {
  const items = await db.watchlistItem.findMany({
    where: { status: "WATCHING" },
    orderBy: { createdAt: "desc" },
    include: { instrument: true, alert: true },
  });

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Bookmark}
        title="Nothing on your watchlist"
        description="Add stocks you want to buy when the price falls into your target range."
        action={{ href: "/watchlist/new", label: "Add stock" }}
      />
    );
  }

  const quotes = await fetchQuotes(items.map((i) => i.instrument.yahooSymbol));
  const quoteMap = new Map(quotes.map((q) => [q.yahooSymbol, q]));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((item) => (
        <WatchlistCard
          key={item.id}
          item={item}
          quote={quoteMap.get(item.instrument.yahooSymbol) ?? null}
        />
      ))}
    </div>
  );
}

async function ArchivedSection() {
  const archived = await db.watchlistItem.findMany({
    where: { status: { in: ["ARCHIVED", "BOUGHT"] } },
    orderBy: { updatedAt: "desc" },
    include: { instrument: true, alert: true },
    take: 20,
  });

  if (archived.length === 0) return null;

  const quotes = await fetchQuotes(archived.map((i) => i.instrument.yahooSymbol));
  const quoteMap = new Map(quotes.map((q) => [q.yahooSymbol, q]));

  return (
    <details className="mt-12">
      <summary className="label mb-4 cursor-pointer select-none text-muted hover:text-foreground">
        Archived & bought ({archived.length})
      </summary>
      <div className="grid gap-4 lg:grid-cols-2">
        {archived.map((item) => (
          <WatchlistCard
            key={item.id}
            item={item}
            quote={quoteMap.get(item.instrument.yahooSymbol) ?? null}
          />
        ))}
      </div>
    </details>
  );
}

function WatchlistGridSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
