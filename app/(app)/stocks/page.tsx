import { ArrowUpRight, LineChart } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import {
  StockCard,
  type StockCardContext,
} from "@/components/stocks/stock-card";
import { db } from "@/lib/db";
import { computeHoldings } from "@/lib/holdings";
import { excludeEmptyUnassignedWhere } from "@/lib/portfolio-visibility";

type PortfolioStockGroup = {
  id: string | null;
  name: string;
  stocks: {
    instrument: InstrumentRow;
    context: StockCardContext;
  }[];
};

type InstrumentRow = Awaited<ReturnType<typeof loadInstruments>>[number];

export default function StocksPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 border-b border-border pb-6">
        <p className="label">Universe</p>
        <h1 className="display mt-2 text-4xl text-foreground">Stocks</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Every instrument referenced by your portfolios, targets, watchlist,
          alerts, and reviews. Click through for research, financials, and
          notes.
        </p>
      </header>

      <Suspense fallback={<StocksGridSkeleton />}>
        <StocksGrid />
      </Suspense>
    </div>
  );
}

async function StocksGrid() {
  const [instruments, portfolios] = await Promise.all([
    loadInstruments(),
    db.portfolio.findMany({
      where: excludeEmptyUnassignedWhere,
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseCurrency: true },
    }),
  ]);

  if (instruments.length === 0) {
    return (
      <EmptyState
        icon={LineChart}
        title="No instruments yet"
        description="Record a trade, add a target, or watch a stock to start tracking the underlying instrument here."
      />
    );
  }

  const portfolioMap = new Map(portfolios.map((p) => [p.id, p]));
  const groups = portfolios.map<PortfolioStockGroup>((p) => ({
    id: p.id,
    name: p.name,
    stocks: [],
  }));
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const noPortfolioGroup: PortfolioStockGroup = {
    id: null,
    name: "No portfolio",
    stocks: [],
  };

  const linkedPortfolioIds = new Set<string>();
  for (const instrument of instruments) {
    for (const portfolioId of getVisiblePortfolioIds(
      instrument,
      portfolioMap,
    )) {
      linkedPortfolioIds.add(portfolioId);
    }
  }

  const holdingsEntries = await Promise.all(
    Array.from(linkedPortfolioIds).map(async (portfolioId) => {
      const holdings = await computeHoldings(portfolioId);
      return [
        portfolioId,
        new Map(holdings.holdings.map((h) => [h.instrumentId, h])),
      ] as const;
    }),
  );
  const holdingsByPortfolio = new Map(holdingsEntries);

  for (const instrument of instruments) {
    const portfolioIds = getVisiblePortfolioIds(instrument, portfolioMap);

    if (portfolioIds.length === 0) {
      noPortfolioGroup.stocks.push({
        instrument,
        context: buildStockContext(instrument, null, null),
      });
      continue;
    }

    for (const portfolioId of portfolioIds) {
      const portfolio = portfolioMap.get(portfolioId);
      const group = groupMap.get(portfolioId);
      if (!portfolio || !group) continue;

      const holding =
        holdingsByPortfolio.get(portfolioId)?.get(instrument.id) ?? null;
      group.stocks.push({
        instrument,
        context: buildStockContext(instrument, portfolioId, {
          holding,
          baseCurrency: portfolio.baseCurrency,
        }),
      });
    }
  }

  const visibleGroups = [...groups.filter((g) => g.stocks.length > 0)];
  if (noPortfolioGroup.stocks.length > 0) {
    visibleGroups.push(noPortfolioGroup);
  }

  return (
    <div className="flex flex-col gap-10">
      {visibleGroups.map((group) => (
        <PortfolioStockSection key={group.id ?? "none"} group={group} />
      ))}
    </div>
  );
}

async function loadInstruments() {
  return db.instrument.findMany({
    orderBy: { symbol: "asc" },
    include: {
      trades: {
        select: { portfolioId: true },
      },
      targets: {
        select: {
          portfolioId: true,
          targetPercent: true,
          intendedBuyPrice: true,
        },
      },
      watchlistItems: {
        select: {
          portfolioId: true,
          status: true,
          buyRangeLow: true,
          buyRangeHigh: true,
        },
      },
      alerts: {
        where: { status: "ACTIVE" },
        select: {
          portfolioId: true,
          type: true,
          priceTarget: true,
        },
      },
      reviews: {
        select: {
          portfolioId: true,
          status: true,
        },
      },
    },
  });
}

function PortfolioStockSection({ group }: { group: PortfolioStockGroup }) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <h2 className="display text-2xl text-foreground">{group.name}</h2>
          <p className="mt-1 text-xs text-muted">
            {group.stocks.length}{" "}
            {group.stocks.length === 1 ? "stock" : "stocks"}
          </p>
        </div>
        {group.id ? (
          <Link
            href={`/portfolios/${group.id}`}
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-accent"
          >
            Open portfolio
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {group.stocks.map(({ instrument, context }) => (
          <StockCard
            key={`${group.id ?? "none"}-${instrument.id}`}
            instrument={instrument}
            context={context}
          />
        ))}
      </div>
    </section>
  );
}

function getVisiblePortfolioIds(
  instrument: InstrumentRow,
  portfolioMap: Map<string, { id: string }>,
) {
  const ids = new Set<string>();

  for (const trade of instrument.trades) {
    if (portfolioMap.has(trade.portfolioId)) ids.add(trade.portfolioId);
  }
  for (const target of instrument.targets) {
    if (portfolioMap.has(target.portfolioId)) ids.add(target.portfolioId);
  }
  for (const item of instrument.watchlistItems) {
    if (item.portfolioId && portfolioMap.has(item.portfolioId)) {
      ids.add(item.portfolioId);
    }
  }
  for (const alert of instrument.alerts) {
    if (alert.portfolioId && portfolioMap.has(alert.portfolioId)) {
      ids.add(alert.portfolioId);
    }
  }
  for (const review of instrument.reviews) {
    if (review.portfolioId && portfolioMap.has(review.portfolioId)) {
      ids.add(review.portfolioId);
    }
  }

  return Array.from(ids);
}

function buildStockContext(
  instrument: InstrumentRow,
  portfolioId: string | null,
  positionData: {
    holding:
      | Awaited<ReturnType<typeof computeHoldings>>["holdings"][number]
      | null;
    baseCurrency: string;
  } | null,
): StockCardContext {
  const groupTrades = portfolioId
    ? instrument.trades.filter((trade) => trade.portfolioId === portfolioId)
    : instrument.trades;
  const groupTargets = portfolioId
    ? instrument.targets.filter((target) => target.portfolioId === portfolioId)
    : instrument.targets.filter((target) => !target.portfolioId);
  const groupWatchlistItems = portfolioId
    ? instrument.watchlistItems.filter(
        (item) => item.portfolioId === portfolioId || item.portfolioId === null,
      )
    : instrument.watchlistItems;
  const groupAlerts = portfolioId
    ? instrument.alerts.filter(
        (alert) =>
          alert.portfolioId === portfolioId || alert.portfolioId === null,
      )
    : instrument.alerts;
  const groupReviews = portfolioId
    ? instrument.reviews.filter(
        (review) =>
          review.portfolioId === portfolioId || review.portfolioId === null,
      )
    : instrument.reviews;
  const primaryTarget = groupTargets[0] ?? null;
  const holding = positionData?.holding ?? null;

  return {
    hasTrade: groupTrades.length > 0,
    hasTarget: groupTargets.length > 0,
    hasWatchlist: groupWatchlistItems.length > 0,
    hasAlert: groupAlerts.length > 0,
    hasReview: groupReviews.length > 0,
    position: holding
      ? {
          quantity: holding.quantity.toString(),
          marketValueBase: holding.marketValueBase?.toString() ?? null,
          unrealizedPnL: holding.unrealizedPnL?.toString() ?? null,
          unrealizedPnLPercent:
            holding.unrealizedPnLPercent?.dividedBy(100).toString() ?? null,
          baseCurrency: positionData?.baseCurrency ?? instrument.currency,
        }
      : null,
    targetPercent: primaryTarget?.targetPercent.toString() ?? null,
    buyTargets: [
      ...groupWatchlistItems
        .filter((item) => item.buyRangeLow || item.buyRangeHigh)
        .map((item) => ({
          source: "watchlist" as const,
          low: item.buyRangeLow?.toString() ?? null,
          high: item.buyRangeHigh?.toString() ?? null,
          price: null,
          currency: instrument.currency,
        })),
      ...groupTargets
        .filter((target) => target.intendedBuyPrice)
        .map((target) => ({
          source: "portfolio" as const,
          low: null,
          high: null,
          price: target.intendedBuyPrice?.toString() ?? null,
          currency: instrument.currency,
        })),
      ...groupAlerts
        .filter((alert) => alert.type === "PRICE_BELOW" && alert.priceTarget)
        .map((alert) => ({
          source: "alert" as const,
          low: null,
          high: null,
          price: alert.priceTarget?.toString() ?? null,
          currency: instrument.currency,
        })),
    ],
  };
}

function StocksGridSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      {[0, 1].map((section) => (
        <section key={section}>
          <div className="mb-4 flex items-end justify-between gap-4 border-b border-border pb-3">
            <div>
              <Skeleton className="h-7 w-40" />
              <Skeleton className="mt-2 h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
