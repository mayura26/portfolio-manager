import { fetchFinancialSummary } from "@/lib/yahoo";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

type Props = {
  yahooSymbol: string;
  currency: string;
};

export async function FinancialsPanel({ yahooSymbol, currency }: Props) {
  const data = await fetchFinancialSummary(yahooSymbol);

  if (!data) {
    return (
      <div className="hairline bg-surface px-4 py-6 text-sm text-muted">
        Financial data unavailable.
      </div>
    );
  }

  const rows: { label: string; value: string }[] = [
    { label: "Market cap", value: data.marketCap !== null ? formatCurrency(data.marketCap, currency, { compact: true }) : "—" },
    { label: "P/E", value: data.peRatio !== null ? formatNumber(data.peRatio, { decimals: 2 }) : "—" },
    { label: "Forward P/E", value: data.forwardPE !== null ? formatNumber(data.forwardPE, { decimals: 2 }) : "—" },
    { label: "EPS (TTM)", value: data.eps !== null ? formatCurrency(data.eps, currency) : "—" },
    {
      label: "Dividend yield",
      value: data.dividendYield !== null ? formatPercent(data.dividendYield, { signed: false }) : "—",
    },
    { label: "Beta", value: data.beta !== null ? formatNumber(data.beta, { decimals: 2 }) : "—" },
    {
      label: "52-week range",
      value:
        data.weekHigh52 !== null && data.weekLow52 !== null
          ? `${formatCurrency(data.weekLow52, currency)} – ${formatCurrency(data.weekHigh52, currency)}`
          : "—",
    },
    {
      label: "Revenue growth",
      value: data.revenueGrowth !== null ? formatPercent(data.revenueGrowth, { signed: true }) : "—",
    },
    {
      label: "Profit margin",
      value: data.profitMargin !== null ? formatPercent(data.profitMargin, { signed: true }) : "—",
    },
    {
      label: "Return on equity",
      value: data.returnOnEquity !== null ? formatPercent(data.returnOnEquity, { signed: true }) : "—",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {data.longBusinessSummary ? (
        <p className="text-sm leading-relaxed text-muted">{data.longBusinessSummary}</p>
      ) : null}

      <dl className="hairline grid grid-cols-2 divide-x divide-y divide-border bg-surface-elevated">
        {rows.map((r) => (
          <div key={r.label} className="px-4 py-3">
            <dt className="label">{r.label}</dt>
            <dd className="display tabular mt-1 text-base text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function FinancialsPanelSkeleton() {
  return (
    <div className="hairline animate-pulse bg-surface p-5">
      <div className="h-32" />
    </div>
  );
}
