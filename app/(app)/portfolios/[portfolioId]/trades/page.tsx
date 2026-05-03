import { Plus, ScrollText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { TradeTable } from "@/components/trades/trade-table";
import { db } from "@/lib/db";

type Params = Promise<{ portfolioId: string }>;

export default function TradesPage({
  params,
}: PageProps<"/portfolios/[portfolioId]/trades">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <TradesContent params={params} />
    </Suspense>
  );
}

async function TradesContent({ params }: { params: Params }) {
  const { portfolioId } = await params;
  const portfolio = await db.portfolio.findUnique({
    where: { id: portfolioId },
    include: {
      trades: {
        orderBy: { date: "desc" },
        include: { instrument: true },
      },
    },
  });
  if (!portfolio) notFound();

  if (portfolio.trades.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="No trades yet"
        description="Add your first trade to start tracking holdings and performance for this portfolio."
        action={{
          href: `/portfolios/${portfolio.id}/trades/new`,
          label: "Record a trade",
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {portfolio.trades.length}{" "}
          {portfolio.trades.length === 1 ? "trade" : "trades"}
        </p>
        <Link
          href={`/portfolios/${portfolio.id}/trades/new`}
          className="inline-flex items-center gap-2 bg-accent px-3 py-1.5 text-xs text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          Add trade
        </Link>
      </div>
      <TradeTable portfolioId={portfolio.id} trades={portfolio.trades} />
    </div>
  );
}
