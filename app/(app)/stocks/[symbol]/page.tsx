import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/shared/skeleton";
import {
  FinancialsPanel,
  FinancialsPanelSkeleton,
} from "@/components/stocks/financials-panel";
import { ForecastCard } from "@/components/stocks/forecast-card";
import { ForecastHistory } from "@/components/stocks/forecast-history";
import { ForecastUpload } from "@/components/stocks/forecast-upload";
import { NewsFeed, NewsFeedSkeleton } from "@/components/stocks/news-feed";
import {
  PriceChart,
  PriceChartSkeleton,
  parsePriceChartRange,
} from "@/components/stocks/price-chart";
import { RunForecastButton } from "@/components/stocks/run-forecast-button";
import { SignalsCard } from "@/components/stocks/signals-card";
import { db } from "@/lib/db";
import { resolveActiveForecast } from "@/lib/forecasts";
import { resolveInstrumentYahooSymbolFromUrlPath } from "@/lib/instruments";

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
          <Suspense fallback={<PriceChartSkeleton />}>
            <PriceChartLoader params={params} searchParams={searchParams} />
          </Suspense>
        </section>

        <section>
          <Suspense fallback={null}>
            <SignalsLoader params={params} />
          </Suspense>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="display text-2xl text-foreground">AI forecast</h2>
            <Suspense fallback={null}>
              <ForecastButtonLoader params={params} />
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

async function ForecastButtonLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) return null;
  const instrument = await db.instrument.findUnique({ where: { yahooSymbol } });
  if (!instrument) return null;
  return <RunForecastButton instrumentId={instrument.id} />;
}

async function SignalsLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) return null;
  const instrument = await db.instrument.findUnique({ where: { yahooSymbol } });
  if (!instrument) return null;
  return <SignalsCard instrumentId={instrument.id} />;
}

async function ForecastUploadLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) return null;
  const instrument = await db.instrument.findUnique({ where: { yahooSymbol } });
  if (!instrument) return null;
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
      <ForecastCard forecast={active} currency={instrument.currency} />
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
