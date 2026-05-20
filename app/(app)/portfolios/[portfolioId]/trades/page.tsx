import { Plus, ScrollText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { TradeTable } from "@/components/trades/trade-table";
import { db } from "@/lib/db";
import {
  excludeEmptyUnassignedWhere,
  visibleTradeWhere,
} from "@/lib/portfolio-visibility";

type Params = Promise<{ portfolioId: string }>;
type SearchParams = Promise<{ showHidden?: string }>;

export default function TradesPage({
  params,
  searchParams,
}: PageProps<"/portfolios/[portfolioId]/trades">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <TradesContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function TradesContent({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { portfolioId } = await params;
  const query = await searchParams;
  const showHidden = query.showHidden === "1";

  const [portfolio, allPortfolios, hiddenTrades, hiddenCount] =
    await Promise.all([
      db.portfolio.findUnique({
        where: { id: portfolioId },
        include: {
          trades: {
            where: visibleTradeWhere,
            orderBy: { date: "desc" },
            include: { instrument: true },
          },
        },
      }),
      db.portfolio.findMany({
        where: excludeEmptyUnassignedWhere,
        orderBy: [{ group: { name: "asc" } }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          baseCurrency: true,
          group: { select: { id: true, name: true } },
        },
      }),
      showHidden
        ? db.trade.findMany({
            where: { portfolioId, isHidden: true },
            orderBy: { date: "desc" },
            include: { instrument: true },
          })
        : Promise.resolve([]),
      db.trade.count({ where: { portfolioId, isHidden: true } }),
    ]);
  if (!portfolio) notFound();

  const isUnassigned = portfolio.name === "Unassigned";
  const moveTargets = allPortfolios
    .filter((p) => p.id !== portfolio.id)
    .map((p) => ({
      id: p.id,
      name: p.name,
      groupName: p.group.name,
      baseCurrency: p.baseCurrency,
    }));

  if (
    portfolio.trades.length === 0 &&
    (!isUnassigned || !showHidden || hiddenTrades.length === 0)
  ) {
    return (
      <EmptyState
        icon={ScrollText}
        title={isUnassigned ? "No visible trades" : "No trades yet"}
        description={
          isUnassigned
            ? "Unassigned trades that you hide stay out of assignment, holdings, and reporting."
            : "Add your first trade to start tracking holdings and performance for this portfolio."
        }
        action={
          isUnassigned && hiddenCount > 0
            ? {
                href: `/portfolios/${portfolio.id}/trades?showHidden=1`,
                label: "Show hidden trades",
              }
            : {
                href: `/portfolios/${portfolio.id}/trades/new`,
                label: "Record a trade",
              }
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {portfolio.trades.length} visible{" "}
          {portfolio.trades.length === 1 ? "trade" : "trades"}
        </p>
        <div className="flex items-center gap-2">
          {isUnassigned && hiddenCount > 0 ? (
            <Link
              href={
                showHidden
                  ? `/portfolios/${portfolio.id}/trades`
                  : `/portfolios/${portfolio.id}/trades?showHidden=1`
              }
              className="px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              {showHidden ? "Hide hidden" : `Show hidden (${hiddenCount})`}
            </Link>
          ) : null}
          <Link
            href={`/portfolios/${portfolio.id}/trades/new`}
            className="inline-flex items-center gap-2 bg-accent px-3 py-1.5 text-xs text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            Add trade
          </Link>
        </div>
      </div>
      <TradeTable
        portfolioId={portfolio.id}
        isUnassigned={isUnassigned}
        trades={portfolio.trades}
        hiddenTrades={showHidden ? hiddenTrades : []}
        moveTargets={moveTargets}
      />
    </div>
  );
}
