import { Suspense } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { FinancialsPanel, FinancialsPanelSkeleton } from "@/components/stocks/financials-panel";
import { NewsFeed, NewsFeedSkeleton } from "@/components/stocks/news-feed";
import { PriceChart, PriceChartSkeleton } from "@/components/stocks/price-chart";

type Params = Promise<{ symbol: string }>;

export default function StockOverviewPage({ params }: PageProps<"/stocks/[symbol]">) {
  return (
    <div className="grid gap-10 lg:grid-cols-3">
      <div className="flex flex-col gap-10 lg:col-span-2">
        <section>
          <h2 className="display mb-4 text-2xl text-foreground">Price</h2>
          <Suspense fallback={<PriceChartSkeleton />}>
            <PriceChartLoader params={params} />
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

async function PriceChartLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = decodeURIComponent(symbol).toUpperCase();
  const instrument = await db.instrument.findUnique({ where: { yahooSymbol } });
  if (!instrument) notFound();
  return <PriceChart yahooSymbol={instrument.yahooSymbol} currency={instrument.currency} days={180} />;
}

async function FinancialsLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = decodeURIComponent(symbol).toUpperCase();
  const instrument = await db.instrument.findUnique({ where: { yahooSymbol } });
  if (!instrument) notFound();
  return <FinancialsPanel yahooSymbol={instrument.yahooSymbol} currency={instrument.currency} />;
}

async function NewsLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = decodeURIComponent(symbol).toUpperCase();
  const instrument = await db.instrument.findUnique({ where: { yahooSymbol } });
  if (!instrument) notFound();
  return <NewsFeed yahooSymbol={instrument.yahooSymbol} />;
}
