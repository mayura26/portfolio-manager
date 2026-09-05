import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/shared/skeleton";
import {
  FinancialsPanel,
  FinancialsPanelSkeleton,
} from "@/components/stocks/financials-panel";
import { ForecastCard } from "@/components/stocks/forecast-card";
import { ForecastHistory } from "@/components/stocks/forecast-history";
import { ForecastToggle } from "@/components/stocks/forecast-toggle";
import { ForecastUpload } from "@/components/stocks/forecast-upload";
import { NewsFeed, NewsFeedSkeleton } from "@/components/stocks/news-feed";
import {
  PriceChart,
  PriceChartSkeleton,
  parsePriceChartRange,
} from "@/components/stocks/price-chart";
import {
  PriceTargetPanel,
  PriceTargetPanelSkeleton,
} from "@/components/stocks/price-target-panel";
import { RunForecastButton } from "@/components/stocks/run-forecast-button";
import { SignalsCard } from "@/components/stocks/signals-card";
import { SmartMoneyCard } from "@/components/stocks/smart-money-card";
import { db } from "@/lib/db";
import { resolveActiveForecast } from "@/lib/forecasts";
import {
  formatCurrency,
  formatPercent,
  formatQuantity,
  pnlClass,
} from "@/lib/format";
import { resolveInstrumentYahooSymbolFromUrlPath } from "@/lib/instruments";
import { type AggregatePosition, aggregateOpenPositions } from "@/lib/signals";

type Params = Promise<{ symbol: string }>;
type SearchParams = Promise<{ range?: string | string[] }>;

export default function StockOverviewPage({
  params,
  searchParams,
}: PageProps<"/stocks/[symbol]">) {
  return (
    <div className="grid gap-10 lg:grid-cols-3">
      <div className="flex flex-col gap-10 lg:col-span-2">
        <section>
          <h2 className="display mb-4 text-2xl text-foreground">Price</h2>
          <Suspense fallback={null}>
            <ActivePositionLoader params={params} />
          </Suspense>
          <div className="flex flex-col gap-4">
            <Suspense fallback={<PriceChartSkeleton />}>
              <PriceChartLoader params={params} searchParams={searchParams} />
            </Suspense>
            <Suspense fallback={<PriceTargetPanelSkeleton />}>
              <PriceTargetsLoader params={params} />
            </Suspense>
          </div>
        </section>

        <section>
          <Suspense fallback={null}>
            <SignalsLoader params={params} />
          </Suspense>
        </section>

        <section>
          <Suspense fallback={null}>
            <SmartMoneyLoader params={params} />
          </Suspense>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="display text-2xl text-foreground">AI forecast</h2>
            <Suspense fallback={null}>
              <ForecastControlsLoader params={params} />
            </Suspense>
          </div>
          <Suspense fallback={<Skeleton className="h-32 w-full" />}>
            <ForecastLoader params={params} />
          </Suspense>
          <Suspense fallback={null}>
            <ForecastUploadLoader params={params} />
          </Suspense>
        </section>

        <section>
          <h2 className="display mb-4 text-2xl text-foreground">Financials</h2>
          <Suspense fallback={<FinancialsPanelSkeleton />}>
            <FinancialsLoader params={params} />
          </Suspense>
        </section>
      </div>

      <aside>
        <h2 className="display mb-4 text-2xl text-foreground">News</h2>
        <Suspense fallback={<NewsFeedSkeleton />}>
          <NewsLoader params={params} />
        </Suspense>
      </aside>
    </div>
  );
}

async function ActivePositionLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) return null;
  const instrument = await db.instrument.findUnique({
    where: { yahooSymbol },
    select: { id: true },
  });
  if (!instrument) return null;

  const position =
    (await aggregateOpenPositions()).find(
      (p) => p.instrumentId === instrument.id,
    ) ?? null;
  if (!position) return null;

  return <ActivePositionBanner position={position} />;
}

function ActivePositionBanner({ position }: { position: AggregatePosition }) {
  const pnl = position.unrealizedPnL;
  const pnlPercent = position.unrealizedPnLPercent;
  const pnlTone = pnl ? pnlClass(pnl) : "text-muted";

  return (
    <div className="hairline mb-4 bg-surface px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="label text-[0.65rem] text-subtle">Active position</p>
          <p className="mt-1 truncate text-sm text-foreground">
            <span className="tabular font-medium">
              {formatQuantity(position.quantity)}
            </span>{" "}
            shares @{" "}
            <span className="tabular">
              {formatCurrency(position.avgCostInstrument, position.currency)}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm sm:min-w-72">
          <PositionMetric
            label="Value"
            value={
              position.marketValueBase
                ? formatCurrency(
                    position.marketValueBase,
                    position.baseCurrency,
                  )
                : "-"
            }
          />
          <PositionMetric
            label="P&L"
            value={
              pnl
                ? formatCurrency(pnl, position.baseCurrency, { signed: true })
                : "-"
            }
            detail={
              pnlPercent
                ? formatPercent(pnlPercent.dividedBy(100), {
                    decimals: 1,
                    signed: true,
                  })
                : null
            }
            valueClassName={pnlTone}
          />
        </div>
      </div>
    </div>
  );
}

function PositionMetric({
  label,
  value,
  detail,
  valueClassName = "text-foreground",
}: {
  label: string;
  value: string;
  detail?: string | null;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="label text-[0.65rem] text-subtle">{label}</p>
      <p className={`tabular truncate font-medium ${valueClassName}`}>
        {value}
      </p>
      {detail ? <p className="tabular text-xs text-subtle">{detail}</p> : null}
    </div>
  );
}

async function ForecastControlsLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) return null;
  const instrument = await db.instrument.findUnique({
    where: { yahooSymbol },
    select: { id: true, forecastsEnabled: true },
  });
  if (!instrument) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ForecastToggle
        instrumentId={instrument.id}
        enabled={instrument.forecastsEnabled}
      />
      {instrument.forecastsEnabled ? (
        <RunForecastButton instrumentId={instrument.id} />
      ) : null}
    </div>
  );
}

async function SignalsLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) return null;
  const instrument = await db.instrument.findUnique({ where: { yahooSymbol } });
  if (!instrument) return null;
  return <SignalsCard instrumentId={instrument.id} />;
}

async function SmartMoneyLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) return null;
  const instrument = await db.instrument.findUnique({ where: { yahooSymbol } });
  if (!instrument) return null;
  return <SmartMoneyCard ticker={instrument.symbol} />;
}

async function ForecastUploadLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) return null;
  const instrument = await db.instrument.findUnique({
    where: { yahooSymbol },
    select: { id: true, forecastsEnabled: true },
  });
  if (!instrument) return null;
  if (!instrument.forecastsEnabled) {
    return (
      <div className="hairline bg-surface px-5 py-4 text-sm text-muted">
        Forecasts disabled for this instrument.
      </div>
    );
  }
  return <ForecastUpload instrumentId={instrument.id} />;
}

async function ForecastLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) notFound();
  const instrument = await db.instrument.findUnique({
    where: { yahooSymbol },
    include: {
      forecasts: { orderBy: { generatedAt: "desc" }, take: 20 },
    },
  });
  if (!instrument) notFound();

  const active = await resolveActiveForecast(instrument.id);
  const history = instrument.forecasts.filter((f) => f.id !== active?.id);

  return (
    <div className="flex flex-col gap-3">
      <ForecastCard
        forecast={active}
        currency={instrument.currency}
        emptyText={
          instrument.forecastsEnabled ? undefined : "No forecast saved yet."
        }
      />
      <ForecastHistory forecasts={history} currency={instrument.currency} />
    </div>
  );
}

async function PriceChartLoader({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { symbol } = await params;
  const query = await searchParams;
  const range = parsePriceChartRange(query.range);
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) notFound();
  const instrument = await db.instrument.findUnique({ where: { yahooSymbol } });
  if (!instrument) notFound();
  return (
    <PriceChart
      instrumentId={instrument.id}
      yahooSymbol={instrument.yahooSymbol}
      currency={instrument.currency}
      range={range}
    />
  );
}

async function PriceTargetsLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) return null;
  const instrument = await db.instrument.findUnique({ where: { yahooSymbol } });
  if (!instrument) return null;
  return (
    <PriceTargetPanel
      instrumentId={instrument.id}
      currency={instrument.currency}
    />
  );
}

async function FinancialsLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) notFound();
  const instrument = await db.instrument.findUnique({ where: { yahooSymbol } });
  if (!instrument) notFound();
  return (
    <FinancialsPanel
      yahooSymbol={instrument.yahooSymbol}
      currency={instrument.currency}
    />
  );
}

async function NewsLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) notFound();
  const instrument = await db.instrument.findUnique({ where: { yahooSymbol } });
  if (!instrument) notFound();
  return <NewsFeed yahooSymbol={instrument.yahooSymbol} />;
}
