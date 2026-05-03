import { Briefcase, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PortfolioCard } from "@/components/portfolios/portfolio-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";

export default function PortfoliosPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-end justify-between border-b border-border pb-6">
        <div>
          <p className="label">Holdings</p>
          <h1 className="display mt-2 text-4xl text-foreground">Portfolios</h1>
          <p className="mt-2 max-w-prose text-sm text-muted">
            A portfolio is a logical grouping of trades reported in a single
            base currency.
          </p>
        </div>
        <Link
          href="/portfolios/new"
          className="inline-flex items-center gap-2 bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          New portfolio
        </Link>
      </header>

      <Suspense fallback={<PortfolioListSkeleton />}>
        <PortfolioList />
      </Suspense>
    </div>
  );
}

async function PortfolioList() {
  const portfolios = await db.portfolio.findMany({
    orderBy: { createdAt: "desc" },
  });

  if (portfolios.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No portfolios yet"
        description="Create your first portfolio to start tracking trades and performance."
        action={{ href: "/portfolios/new", label: "Create portfolio" }}
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {portfolios.map((p) => (
        <PortfolioCard key={p.id} portfolio={p} />
      ))}
    </div>
  );
}

function PortfolioListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-40" />
      ))}
    </div>
  );
}
