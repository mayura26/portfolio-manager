import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HoldingTargetsEditor } from "@/components/portfolios/holding-targets-editor";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";
import { computePortfolioAllocation } from "@/lib/portfolio-allocation";

type Params = Promise<{ portfolioId: string }>;

export default function PortfolioTargetsPage({
  params,
}: PageProps<"/portfolios/[portfolioId]/targets">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PortfolioTargets params={params} />
    </Suspense>
  );
}

async function PortfolioTargets({ params }: { params: Params }) {
  const { portfolioId } = await params;
  const portfolio = await db.portfolio.findUnique({
    where: { id: portfolioId },
  });
  if (!portfolio) notFound();

  const allocation = await computePortfolioAllocation(portfolioId);

  // Selectable instruments: held + watchlist-assigned + previously targeted.
  const watchlistInstruments = await db.watchlistItem.findMany({
    where: { portfolioId },
    include: { instrument: true },
  });

  const watchlistBuyMap = new Map(
    watchlistInstruments.map((w) => [
      w.instrumentId,
      (w.buyRangeHigh ?? w.buyRangeLow)?.toString() ?? "",
    ]),
  );

  const initialRowsMap = new Map<
    string,
    ReturnType<typeof rowFromAllocation>
  >();
  for (const r of allocation.rows) {
    if (r.hasTarget || r.isHeld) {
      const base = rowFromAllocation(r);
      initialRowsMap.set(r.instrumentId, {
        ...base,
        intendedBuyPrice:
          base.intendedBuyPrice || (watchlistBuyMap.get(r.instrumentId) ?? ""),
      });
    }
  }

  const selectableMap = new Map<
    string,
    { id: string; symbol: string; name: string; currency: string }
  >();
  for (const r of allocation.rows) {
    selectableMap.set(r.instrumentId, {
      id: r.instrumentId,
      symbol: r.symbol,
      name: r.name,
      currency: r.currency,
    });
  }
  for (const w of watchlistInstruments) {
    selectableMap.set(w.instrumentId, {
      id: w.instrument.id,
      symbol: w.instrument.symbol,
      name: w.instrument.name,
      currency: w.instrument.currency,
    });
  }

  const watchlistBuyPrices = Object.fromEntries(watchlistBuyMap);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="display text-2xl text-foreground">Target weights</h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Set the target range for each instrument. Watchlist stocks assigned to
          this portfolio appear in the picker. The combined ranges must allow a
          100% allocation.
        </p>
      </header>

      <HoldingTargetsEditor
        portfolioId={portfolioId}
        initialRows={Array.from(initialRowsMap.values())}
        selectableInstruments={Array.from(selectableMap.values())}
        watchlistBuyPrices={watchlistBuyPrices}
      />
    </div>
  );
}

function rowFromAllocation(r: {
  instrumentId: string;
  symbol: string;
  name: string;
  currency: string;
  targetPercent: { toString(): string };
  targetMinPercent: { toString(): string };
  targetMaxPercent: { toString(): string };
  intendedBuyPrice: { toString(): string } | null;
  intendedSellPrice: { toString(): string } | null;
  trimAtGainPercent: { toString(): string } | null;
  recommendationAction: "BUY" | "SELL" | "TRIM" | null;
  recommendationSource: "MANUAL" | "AI" | null;
  recommendationRationale: string | null;
  recommendationGeneratedAt: Date | null;
  recommendationModel: string | null;
  recommendationReasoningEffort: string | null;
  notes: string | null;
  isHeld: boolean;
  hasTarget: boolean;
}) {
  return {
    instrumentId: r.instrumentId,
    symbol: r.symbol,
    name: r.name,
    currency: r.currency,
    targetPercent: r.hasTarget ? r.targetPercent.toString() : "0",
    targetMinPercent: r.hasTarget ? r.targetMinPercent.toString() : "0",
    targetMaxPercent: r.hasTarget ? r.targetMaxPercent.toString() : "0",
    intendedBuyPrice: r.intendedBuyPrice ? r.intendedBuyPrice.toString() : "",
    intendedSellPrice: r.intendedSellPrice
      ? r.intendedSellPrice.toString()
      : "",
    trimAtGainPercent: r.trimAtGainPercent
      ? r.trimAtGainPercent.toString()
      : "",
    recommendationAction: r.recommendationAction ?? "",
    recommendationSource: r.recommendationSource ?? "",
    recommendationRationale: r.recommendationRationale ?? "",
    recommendationGeneratedAt: r.recommendationGeneratedAt
      ? r.recommendationGeneratedAt.toISOString()
      : "",
    recommendationModel: r.recommendationModel ?? "",
    recommendationReasoningEffort: r.recommendationReasoningEffort ?? "",
    notes: r.notes ?? "",
    isHeld: r.isHeld,
  };
}
