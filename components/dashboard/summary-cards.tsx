import Decimal from "decimal.js";
import { StatCard } from "@/components/shared/stat-card";
import { getDashboardSummary } from "@/lib/dashboard";
import { formatCurrency, formatPercent } from "@/lib/format";

const ZERO = new Decimal(0);

function TotalValueCard({
  stocksBase,
  cashBase,
  baseCurrency,
  hint,
}: {
  stocksBase: string;
  cashBase: string;
  baseCurrency: string;
  hint: string;
}) {
  const stocks = new Decimal(stocksBase);
  const cash = new Decimal(cashBase);
  const total = stocks.plus(cash);
  const stocksPct = total.gt(0) ? stocks.dividedBy(total).times(100) : ZERO;
  const cashPct = total.gt(0) ? cash.dividedBy(total).times(100) : ZERO;
  const stocksBar = total.gt(0)
    ? Number(stocks.dividedBy(total).times(100).toFixed(2))
    : 0;
  let cashBar = total.gt(0)
    ? Number(cash.dividedBy(total).times(100).toFixed(2))
    : 0;
  if (stocksBar > 0 && cashBar > 0) {
    cashBar = Number((100 - stocksBar).toFixed(2));
  }

  return (
    <div className="hairline bg-surface p-5">
      <p className="label">Total value</p>
      <p className="display tabular mt-3 text-3xl text-foreground">
        {formatCurrency(total.toString(), baseCurrency)}
      </p>
      <p className="mt-1 text-xs text-muted">
        Stocks + cash in your default currency
      </p>

      <div
        className="mt-4 flex h-2 w-full overflow-hidden bg-border"
        role="img"
        aria-label={`Stocks ${stocksBar.toFixed(0)}%, cash ${cashBar.toFixed(0)}%`}
      >
        {stocksBar > 0 ? (
          <div
            className="h-full shrink-0 bg-accent"
            style={{ width: `${stocksBar}%` }}
          />
        ) : null}
        {cashBar > 0 ? (
          <div
            className="h-full shrink-0 bg-[var(--info)]"
            style={{ width: `${cashBar}%` }}
          />
        ) : null}
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">Stocks</dt>
          <dd className="tabular text-right text-foreground">
            {formatCurrency(stocks.toString(), baseCurrency)}
            <span className="ml-2 text-xs text-subtle">
              (
              {formatPercent(stocksPct.dividedBy(100).toString(), {
                decimals: 1,
                signed: false,
              })}
              )
            </span>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">Cash</dt>
          <dd className="tabular text-right text-foreground">
            {formatCurrency(cash.toString(), baseCurrency)}
            <span className="ml-2 text-xs text-subtle">
              (
              {formatPercent(cashPct.dividedBy(100).toString(), {
                decimals: 1,
                signed: false,
              })}
              )
            </span>
          </dd>
        </div>
      </dl>

      {hint ? <p className="mt-3 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

export async function SummaryCards() {
  const data = await getDashboardSummary();

  const unrealizedTone = data.totalUnrealizedPnL.isZero()
    ? "neutral"
    : data.totalUnrealizedPnL.isPositive()
      ? "gain"
      : "loss";
  const realizedTone = data.totalRealizedPnL.isZero()
    ? "neutral"
    : data.totalRealizedPnL.isPositive()
      ? "gain"
      : "loss";
  const dailyTone = data.totalDailyChange.isZero()
    ? "neutral"
    : data.totalDailyChange.isPositive()
      ? "gain"
      : "loss";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <TotalValueCard
        stocksBase={data.totalMarketValueBase.toString()}
        cashBase={data.totalCashBase.toString()}
        baseCurrency={data.baseCurrency}
        hint={`${data.portfolioCount} ${data.portfolioCount === 1 ? "portfolio" : "portfolios"} · ${data.holdingCount} ${data.holdingCount === 1 ? "holding" : "holdings"}`}
      />
      <StatCard
        label="Unrealized P&L"
        value={formatCurrency(
          data.totalUnrealizedPnL.toString(),
          data.baseCurrency,
          {
            signed: true,
          },
        )}
        delta={{
          value: data.totalCostBase.gt(0)
            ? formatPercent(
                data.totalUnrealizedPnL
                  .dividedBy(data.totalCostBase)
                  .toString(),
                { signed: true },
              )
            : "—",
          tone: unrealizedTone,
        }}
      />
      <StatCard
        label="Daily change"
        value={formatCurrency(
          data.totalDailyChange.toString(),
          data.baseCurrency,
          {
            signed: true,
          },
        )}
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
        value={formatCurrency(
          data.totalRealizedPnL.toString(),
          data.baseCurrency,
          {
            signed: true,
          },
        )}
        delta={{
          value:
            realizedTone === "gain"
              ? "Banked gains"
              : realizedTone === "loss"
                ? "Realized loss"
                : "—",
          tone: realizedTone,
        }}
      />
    </div>
  );
}

export function SummaryCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="hairline animate-pulse bg-surface p-5">
        <div className="h-3 w-24 bg-border" />
        <div className="mt-3 h-9 w-40 bg-border" />
        <div className="mt-2 h-2 w-full bg-border" />
        <div className="mt-4 space-y-2">
          <div className="h-4 w-full bg-border" />
          <div className="h-4 w-full bg-border" />
        </div>
        <div className="mt-3 h-3 w-48 bg-border" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="hairline animate-pulse bg-surface p-5">
          <div className="h-3 w-20 bg-border" />
          <div className="mt-3 h-8 w-32 bg-border" />
          <div className="mt-2 h-3 w-24 bg-border" />
        </div>
      ))}
    </div>
  );
}
