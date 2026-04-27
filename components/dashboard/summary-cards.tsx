import { StatCard } from "@/components/shared/stat-card";
import { getDashboardSummary } from "@/lib/dashboard";
import { formatCurrency, formatPercent } from "@/lib/format";

export async function SummaryCards() {
  const data = await getDashboardSummary();

  const unrealizedTone =
    data.totalUnrealizedPnL.isZero()
      ? "neutral"
      : data.totalUnrealizedPnL.isPositive()
        ? "gain"
        : "loss";
  const realizedTone =
    data.totalRealizedPnL.isZero()
      ? "neutral"
      : data.totalRealizedPnL.isPositive()
        ? "gain"
        : "loss";
  const dailyTone =
    data.totalDailyChange.isZero()
      ? "neutral"
      : data.totalDailyChange.isPositive()
        ? "gain"
        : "loss";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Market value"
        value={formatCurrency(data.totalMarketValueBase.toString(), data.baseCurrency)}
        hint={`${data.portfolioCount} ${data.portfolioCount === 1 ? "portfolio" : "portfolios"} · ${data.holdingCount} ${data.holdingCount === 1 ? "holding" : "holdings"}`}
      />
      <StatCard
        label="Unrealized P&L"
        value={formatCurrency(data.totalUnrealizedPnL.toString(), data.baseCurrency, {
          signed: true,
        })}
        delta={{
          value:
            data.totalCostBase.gt(0)
              ? formatPercent(
                  data.totalUnrealizedPnL.dividedBy(data.totalCostBase).toString(),
                  { signed: true },
                )
              : "—",
          tone: unrealizedTone,
        }}
      />
      <StatCard
        label="Daily change"
        value={formatCurrency(data.totalDailyChange.toString(), data.baseCurrency, {
          signed: true,
        })}
        delta={
          data.totalDailyChangePercent
            ? {
                value: formatPercent(
                  data.totalDailyChangePercent.dividedBy(100).toString(),
                  { signed: true },
                ),
                tone: dailyTone,
              }
            : undefined
        }
      />
      <StatCard
        label="Realized P&L"
        value={formatCurrency(data.totalRealizedPnL.toString(), data.baseCurrency, {
          signed: true,
        })}
        delta={{
          value: realizedTone === "gain" ? "Banked gains" : realizedTone === "loss" ? "Realized loss" : "—",
          tone: realizedTone,
        }}
      />
    </div>
  );
}

export function SummaryCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="hairline animate-pulse bg-surface p-5">
          <div className="h-3 w-20 bg-border" />
          <div className="mt-3 h-8 w-32 bg-border" />
          <div className="mt-2 h-3 w-24 bg-border" />
        </div>
      ))}
    </div>
  );
}
