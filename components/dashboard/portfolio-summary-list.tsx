import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { getPortfolioSummaries } from "@/lib/dashboard";
import { formatCurrency, formatPercent, pnlClass } from "@/lib/format";

export async function PortfolioSummaryList() {
  const summaries = await getPortfolioSummaries();

  if (summaries.length === 0) {
    return (
      <p className="text-sm text-muted">
        Create a portfolio to start tracking. Aggregate stats will appear here.
      </p>
    );
  }

  return (
    <ul className="hairline divide-y divide-border bg-surface-elevated">
      {summaries.map((s) => (
        <li key={s.id}>
          <Link
            href={`/portfolios/${s.id}`}
            className="group flex items-center justify-between gap-3 px-4 py-4 hover:bg-surface"
          >
            <div className="min-w-0">
              <p className="text-sm text-foreground">
                <span className="font-medium">{s.name}</span>
                <span className="label ml-2">{s.baseCurrency}</span>
              </p>
              <p className="label mt-1">
                Realized{" "}
                {formatCurrency(s.realizedPnL.toString(), s.baseCurrency, {
                  signed: true,
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="display tabular text-lg text-foreground">
                {formatCurrency(s.marketValue.toString(), s.baseCurrency)}
              </p>
              <p
                className={`tabular text-xs ${pnlClass(s.unrealizedPnL.toString())}`}
              >
                {formatCurrency(s.unrealizedPnL.toString(), s.baseCurrency, {
                  signed: true,
                })}
                {s.unrealizedPercent ? (
                  <span className="ml-1 text-muted">
                    (
                    {formatPercent(
                      s.unrealizedPercent.dividedBy(100).toString(),
                      { signed: true },
                    )}
                    )
                  </span>
                ) : null}
              </p>
            </div>
            <ArrowUpRight
              className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-accent"
              strokeWidth={1.5}
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PortfolioSummaryListSkeleton() {
  return (
    <div className="hairline animate-pulse bg-surface p-4">
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 bg-border" />
        ))}
      </div>
    </div>
  );
}
