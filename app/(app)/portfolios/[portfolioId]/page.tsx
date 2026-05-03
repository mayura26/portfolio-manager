import { Briefcase, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HoldingsTable } from "@/components/portfolios/holdings-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";
import { formatCurrency, pnlClass } from "@/lib/format";
import { computeHoldings } from "@/lib/holdings";

type Params = Promise<{ portfolioId: string }>;

export default function PortfolioOverviewPage({
  params,
}: PageProps<"/portfolios/[portfolioId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PortfolioOverview params={params} />
    </Suspense>
  );
}

async function PortfolioOverview({ params }: { params: Params }) {
  const { portfolioId } = await params;
  const portfolio = await db.portfolio.findUnique({
    where: { id: portfolioId },
  });
  if (!portfolio) notFound();

  const data = await computeHoldings(portfolioId);

  if (data.holdings.length === 0 && data.totalRealizedPnL.isZero()) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No holdings yet"
        description="Record a trade to populate this portfolio. Holdings, cost basis, and P&L appear here automatically."
        action={{
          href: `/portfolios/${portfolio.id}/trades/new`,
          label: "Record first trade",
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Market value"
          value={formatCurrency(
            data.totalMarketValueBase.toString(),
            data.baseCurrency,
          )}
        />
        <Stat
          label="Unrealized P&L"
          value={formatCurrency(
            data.totalUnrealizedPnL.toString(),
            data.baseCurrency,
            {
              signed: true,
            },
          )}
          tone={pnlClass(data.totalUnrealizedPnL.toString())}
        />
        <Stat
          label="Realized P&L"
          value={formatCurrency(
            data.totalRealizedPnL.toString(),
            data.baseCurrency,
            {
              signed: true,
            },
          )}
          tone={pnlClass(data.totalRealizedPnL.toString())}
        />
      </div>

      {data.hasMissingPrices ? (
        <p className="text-xs text-warning">
          Some instruments are missing recent prices. Trigger the price cron or
          wait for it to run.
        </p>
      ) : null}

      {data.holdings.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="display text-2xl text-foreground">Open positions</h2>
            <Link
              href={`/portfolios/${portfolio.id}/trades/new`}
              className="inline-flex items-center gap-2 bg-accent px-3 py-1.5 text-xs text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              Add trade
            </Link>
          </div>
          <HoldingsTable data={data} />
        </div>
      ) : (
        <p className="text-sm text-muted">
          No open positions. Realized P&L includes closed trades.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="hairline bg-surface p-5">
      <p className="label">{label}</p>
      <p
        className={`display tabular mt-3 text-2xl ${tone ?? "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}
