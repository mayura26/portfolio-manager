import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { getTopMovers } from "@/lib/dashboard";
import { formatCurrency, formatPercent } from "@/lib/format";

export async function TopMovers() {
  const data = await getTopMovers(5);

  if (data.movers.length === 0) {
    return (
      <p className="text-sm text-muted">
        No daily movement yet. Run the price cron to populate today's quotes.
      </p>
    );
  }

  return (
    <ul className="hairline divide-y divide-border bg-surface-elevated">
      {data.movers.map((m) => {
        const positive = m.changePercent.isPositive();
        const Icon = positive ? ArrowUpRight : ArrowDownRight;
        const tone = positive ? "text-gain" : "text-loss";
        return (
          <li key={m.instrumentId} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <Link
                href={`/stocks/${encodeURIComponent(m.symbol)}`}
                className="text-sm text-foreground hover:text-accent"
              >
                <span className="tabular font-medium">{m.symbol}</span>
                <span className="ml-2 text-muted">{m.name}</span>
              </Link>
              <p className="label">
                {formatCurrency(m.marketValueBase.toString(), data.baseCurrency, { compact: true })}
              </p>
            </div>
            <div className={`flex items-center gap-1 text-sm ${tone}`}>
              <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              <span className="tabular">
                {formatPercent(m.changePercent.dividedBy(100).toString(), { signed: true })}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function TopMoversSkeleton() {
  return (
    <div className="hairline animate-pulse bg-surface p-4">
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 bg-border" />
        ))}
      </div>
    </div>
  );
}
