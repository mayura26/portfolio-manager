import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CompositionPanel } from "@/components/composition/composition-panel";
import { RunCompositionButton } from "@/components/composition/run-composition-button";
import { AllocationChartClient } from "@/components/dashboard/allocation-chart-client";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";
import { computePortfolioAllocation } from "@/lib/portfolio-allocation";

type Params = Promise<{ portfolioId: string }>;

export default function PortfolioCompositionPage({
  params,
}: PageProps<"/portfolios/[portfolioId]/composition">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PortfolioComposition params={params} />
    </Suspense>
  );
}

async function PortfolioComposition({ params }: { params: Params }) {
  const { portfolioId } = await params;
  const portfolio = await db.portfolio.findUnique({
    where: { id: portfolioId },
  });
  if (!portfolio) notFound();

  const allocation = await computePortfolioAllocation(portfolioId);
  const labelMap = new Map(
    allocation.rows.map((r) => [r.instrumentId, `${r.symbol} — ${r.name}`]),
  );

  const analysis = portfolio.aiCompositionAnalysis as
    | Parameters<typeof CompositionPanel>[0]["analysis"]
    | null;

  const actualSlices = allocation.rows
    .filter((r) => r.marketValueBase.gt(0))
    .map((r) => ({
      key: r.instrumentId,
      label: r.symbol,
      value: Number(r.marketValueBase.toFixed(2)),
      percent: Number(r.actualPercent.toFixed(2)),
    }));

  const targetSlices = allocation.rows
    .filter((r) => r.targetPercent.gt(0))
    .map((r) => ({
      key: r.instrumentId,
      label: r.symbol,
      value: Number(r.targetPercent.toFixed(2)),
      percent: Number(r.targetPercent.toFixed(2)),
    }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between">
        <div>
          <h2 className="display text-2xl text-foreground">AI composition</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Review target vs actual weights with an AI second opinion. Each row
            gets a status and the analysis suggests rebalances.
          </p>
        </div>
        <RunCompositionButton scope="portfolio" portfolioId={portfolioId} />
      </header>

      {actualSlices.length > 0 || targetSlices.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="hairline bg-surface px-5 py-5">
            <p className="label mb-4">Actual allocation</p>
            <AllocationChartClient
              slices={actualSlices}
              baseCurrency={allocation.baseCurrency}
            />
          </div>
          <div className="hairline bg-surface px-5 py-5">
            <p className="label mb-4">Target allocation</p>
            <AllocationChartClient
              slices={targetSlices}
              baseCurrency={allocation.baseCurrency}
              percentOnly
            />
          </div>
        </div>
      ) : null}

      <CompositionPanel
        analysis={analysis}
        generatedAt={portfolio.aiCompositionGeneratedAt}
        rowLabel={(key) => labelMap.get(key) ?? key}
      />
    </div>
  );
}
