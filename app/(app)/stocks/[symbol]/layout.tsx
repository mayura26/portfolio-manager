import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/shared/skeleton";
import { AutoWatcherToggle } from "@/components/stocks/autowatcher-toggle";
import { StockTabs } from "@/components/stocks/stock-tabs";
import { db } from "@/lib/db";
import { resolveInstrumentYahooSymbolFromUrlPath } from "@/lib/instruments";

type Params = Promise<{ symbol: string }>;

export default function StockLayout({
  children,
  params,
}: LayoutProps<"/stocks/[symbol]">) {
  return (
    <div className="mx-auto max-w-6xl">
      <Suspense fallback={<HeaderSkeleton />}>
        <StockHeader params={params} />
      </Suspense>

      <Suspense fallback={<TabsSkeleton />}>
        <StockTabsLoader params={params} />
      </Suspense>

      <div className="mt-8">{children}</div>
    </div>
  );
}

async function StockHeader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) notFound();
  const instrument = await db.instrument.findUnique({ where: { yahooSymbol } });
  if (!instrument) notFound();

  // Only show AutoWatcher for instruments with open/past trades
  const tradeCount = await db.trade.count({
    where: { instrument: { yahooSymbol } },
  });
  const hasPosition = tradeCount > 0;

  return (
    <>
      <nav className="label mb-6">
        <Link href="/stocks" className="text-muted hover:text-foreground">
          Stocks
        </Link>{" "}
        / {instrument.symbol}
      </nav>

      <header className="mb-6 border-b border-border pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="label">
              {instrument.exchange} · {instrument.currency}
              {instrument.sector ? ` · ${instrument.sector}` : ""}
            </p>
            <h1 className="display mt-2 text-4xl text-foreground">
              <span className="tabular">{instrument.symbol}</span>
            </h1>
            <p className="mt-1 text-sm text-muted">{instrument.name}</p>
          </div>
          {hasPosition ? (
            <div className="flex-shrink-0 pt-1">
              <AutoWatcherToggle
                instrumentId={instrument.id}
                enabled={instrument.autoWatcherEnabled}
                threshold={Number(instrument.autoWatcherThreshold)}
              />
            </div>
          ) : null}
        </div>
      </header>
    </>
  );
}

async function StockTabsLoader({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) return null;
  return <StockTabs yahooSymbol={yahooSymbol} />;
}

function HeaderSkeleton() {
  return (
    <div className="mb-6">
      <Skeleton className="mb-3 h-3 w-32" />
      <Skeleton className="mb-3 h-10 w-32" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}

function TabsSkeleton() {
  return <Skeleton className="h-10 w-72" />;
}
