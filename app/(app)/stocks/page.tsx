import type Decimal from "decimal.js";
import { LineChart } from "lucide-react";
import { Suspense } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import type { StockCardContext } from "@/components/stocks/stock-card";
import {
  type StocksSearchGroup,
  StocksSearchList,
} from "@/components/stocks/stocks-search-list";
import { db } from "@/lib/db";
import { formatCurrency, formatPercent } from "@/lib/format";
import { computeHoldings } from "@/lib/holdings";
import {
  excludeEmptyUnassignedWhere,
  visibleTradeWhere,
} from "@/lib/portfolio-visibility";
import { loadPriceChanges, type PriceChangeData } from "@/lib/price-changes";
import { trackedInstrumentWhere } from "@/lib/tracked-instruments";

type PortfolioStockGroup = StocksSearchGroup;
type PortfolioSummary = NonNullable<StocksSearchGroup["summary"]>;
type InstrumentRow = Awaited<ReturnType<typeof loadInstruments>>[number];
type PortfolioHoldings = Awaited<ReturnType<typeof computeHoldings>>;

export default function StocksPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 border-b border-border pb-6">
        <p className="label">Universe</p>
        <h1 className="display mt-2 text-4xl text-foreground">Stocks</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Stocks you hold, target, or actively watch. Click through for
          research, financials, and notes.
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
    summary: null,
  }));
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const noPortfolioGroup: PortfolioStockGroup = {
    id: null,
    name: "No portfolio",
    stocks: [],
    summary: null,
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

  const instrumentIds = instruments.map((i) => i.id);

  const [priceChanges, ...holdingsEntries] = await Promise.all([
    loadPriceChanges(instrumentIds),
    ...Array.from(linkedPortfolioIds).map(async (portfolioId) => {
      const holdings = await computeHoldings(portfolioId);
      return [portfolioId, holdings] as const;
    }),
  ]);

  const holdingsDataByPortfolio = new Map(holdingsEntries);
  const holdingsByPortfolio = new Map(
    holdingsEntries.map(([portfolioId, holdings]) => [
      portfolioId,
      new Map(holdings.holdings.map((h) => [h.instrumentId, h])),
    ]),
  );

  for (const group of groups) {
    if (!group.id) continue;
    const holdings = holdingsDataByPortfolio.get(group.id);
    group.summary = holdings ? buildPortfolioSummary(holdings) : null;
  }

  for (const instrument of instruments) {
    const portfolioIds = getVisiblePortfolioIds(instrument, portfolioMap);
    const priceData = priceChanges.get(instrument.id) ?? null;

    if (portfolioIds.length === 0) {
      noPortfolioGroup.stocks.push({
        id: instrument.id,
        instrument: toStockCardInstrument(instrument),
        context: buildStockContext(instrument, null, null, priceData),
        searchText: buildSearchText(instrument, noPortfolioGroup.name),
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
        id: instrument.id,
        instrument: toStockCardInstrument(instrument),
        context: buildStockContext(
          instrument,
          portfolioId,
          { holding, baseCurrency: portfolio.baseCurrency },
          priceData,
        ),
        searchText: buildSearchText(instrument, group.name),
      });
    }
  }

  const visibleGroups = [...groups.filter((g) => g.stocks.length > 0)];
  if (noPortfolioGroup.stocks.length > 0) {
    visibleGroups.push(noPortfolioGroup);
  }

  return <StocksSearchList groups={visibleGroups} />;
}

async function loadInstruments() {
  return db.instrument.findMany({
    where: trackedInstrumentWhere,
    orderBy: { symbol: "asc" },
    include: {
      trades: {
        where: visibleTradeWhere,
        select: { portfolioId: true },
      },
      targets: {
        select: {
          portfolioId: true,
          targetPercent: true,
          intendedBuyPrice: true,
          intendedSellPrice: true,
        },
      },
      watchlistItems: {
        where: { status: "WATCHING" },
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
    // AutoWatcher scalar fields are included by default.
  });
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

function toStockCardInstrument(instrument: InstrumentRow) {
  return {
    yahooSymbol: instrument.yahooSymbol,
    symbol: instrument.symbol,
    name: instrument.name,
    currency: instrument.currency,
    exchange: instrument.exchange,
    sector: instrument.sector,
  };
}

function buildSearchText(instrument: InstrumentRow, groupName: string) {
  return [
    groupName,
    instrument.yahooSymbol,
    instrument.symbol,
    instrument.name,
    instrument.currency,
    instrument.exchange,
    instrument.sector,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildPortfolioSummary(holdings: PortfolioHoldings): PortfolioSummary {
  const unrealizedPercent = holdings.totalCostBase.isZero()
    ? null
    : formatPercent(
        holdings.totalUnrealizedPnL.dividedBy(holdings.totalCostBase),
        {
          signed: true,
          decimals: 2,
        },
      );

  return {
    marketValue: formatCurrency(
      holdings.totalMarketValueBase.toString(),
      holdings.baseCurrency,
    ),
    unrealizedPnl: formatCurrency(
      holdings.totalUnrealizedPnL.toString(),
      holdings.baseCurrency,
      { signed: true },
    ),
    unrealizedPercent,
    tone: toneOf(holdings.totalUnrealizedPnL),
    hasMissingPrices: holdings.hasMissingPrices,
  };
}

function toneOf(value: Decimal): "gain" | "loss" | "neutral" {
  if (value.isZero()) return "neutral";
  return value.isPositive() ? "gain" : "loss";
}

function formatPct(value: Decimal | null): string | null {
  if (!value) return null;
  // value is already a percentage like 2.4 - divide by 100 for formatPercent
  return formatPercent(value.dividedBy(100), { signed: true, decimals: 2 });
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
  priceData: PriceChangeData | null,
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

  const priceInfo = priceData
    ? {
        currentPrice: formatCurrency(
          priceData.currentPrice,
          instrument.currency,
        ),
        changes: [
          { label: "1D", pct: priceData.dayPct },
          { label: "1W", pct: priceData.weekPct },
          { label: "1M", pct: priceData.monthPct },
          { label: "1Y", pct: priceData.yearPct },
        ].map(({ label, pct }) => ({
          label,
          formatted: formatPct(pct),
          raw: pct?.toNumber() ?? null,
        })),
      }
    : null;

  return {
    instrumentId: instrument.id,
    hasTrade: groupTrades.length > 0,
    hasTarget: groupTargets.length > 0,
    hasWatchlist: groupWatchlistItems.length > 0,
    hasAlert: groupAlerts.length > 0,
    hasReview: groupReviews.length > 0,
    priceInfo,
    autoWatcher: instrument.autoWatcherEnabled,
    autoWatcherThreshold: Number(instrument.autoWatcherThreshold),
    position: holding
      ? {
          quantity: holding.quantity.toString(),
          avgCostInstrument: holding.avgCostInstrument.toString(),
          instrumentCurrency: instrument.currency,
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
    sellTargets: [
      ...groupTargets
        .filter((target) => target.intendedSellPrice)
        .map((target) => ({
          source: "portfolio" as const,
          price: target.intendedSellPrice?.toString() ?? null,
          currency: instrument.currency,
        })),
      ...groupAlerts
        .filter((alert) => alert.type === "PRICE_ABOVE" && alert.priceTarget)
        .map((alert) => ({
          source: "alert" as const,
          price: alert.priceTarget?.toString() ?? null,
          currency: instrument.currency,
        })),
    ],
  };
}

function StocksGridSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="hairline bg-surface px-4 py-3">
        <Skeleton className="h-10 w-full" />
      </div>
      {[0, 1].map((section) => (
        <section key={section}>
          <div className="hairline bg-surface px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Skeleton className="h-7 w-40" />
                <Skeleton className="mt-2 h-4 w-72" />
              </div>
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
