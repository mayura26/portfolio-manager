import { ValueChartClient } from "@/components/dashboard/value-chart-client";
import { getPortfolioValueHistory } from "@/lib/dashboard";

type Props = {
  portfolioId: string;
  days?: number;
};

export async function PortfolioValueChart({ portfolioId, days = 90 }: Props) {
  const data = await getPortfolioValueHistory(portfolioId, days);

  return (
    <ValueChartClient
      baseCurrency={data.baseCurrency}
      stackedCash={false}
      showCostBasis
      equitiesLabel="Market value"
      points={data.points.map((p) => ({
        date: p.date.toISOString(),
        equities: p.equities,
        cash: p.cash,
        costBasis: p.costBasis,
      }))}
    />
  );
}

export function PortfolioValueChartSkeleton() {
  return (
    <div className="hairline animate-pulse bg-surface p-5">
      <div className="h-72" />
    </div>
  );
}
