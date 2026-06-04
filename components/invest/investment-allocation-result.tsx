import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import type { InvestmentAllocation } from "@/lib/investment-allocator";

type Props = {
  result: InvestmentAllocation;
  baseCurrency: string;
};

export function InvestmentAllocationResult({ result, baseCurrency }: Props) {
  const fmt = (amount: number) =>
    formatCurrency(amount.toFixed(2), baseCurrency);

  return (
    <div className="flex flex-col gap-6">
      <div className="hairline bg-surface px-5 py-5">
        <p className="label mb-2">Strategy</p>
        <p className="text-sm text-foreground">{result.strategy}</p>
      </div>

      {result.allocations.length > 0 ? (
        <div className="hairline bg-surface">
          <div className="border-b border-border px-5 py-3">
            <p className="label">Suggested allocations</p>
          </div>
          <div className="divide-y divide-border">
            {result.allocations.map((a) => (
              <div key={`${a.symbol}-${a.portfolioName}`} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/stocks/${encodeURIComponent(a.symbol)}`}
                        className="display text-base text-foreground hover:text-accent hover:underline"
                      >
                        {a.symbol}
                      </Link>
                      <span className="text-sm text-muted">{a.name}</span>
                      {a.priority === "primary" ? (
                        <span className="rounded-sm bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">
                          primary
                        </span>
                      ) : (
                        <span className="hairline rounded-sm px-1.5 py-0.5 text-xs text-muted">
                          secondary
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-subtle">{a.portfolioName}</p>
                  </div>
                  <div className="text-right">
                    <p className="display tabular text-lg text-foreground">
                      {fmt(a.suggestedAmount)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted">{a.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="hairline bg-surface px-5 py-4">
          <p className="text-sm text-muted">
            No allocations suggested — see strategy above for details.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="hairline bg-surface p-5">
          <p className="label">Total allocated</p>
          <p className="display tabular mt-2 text-2xl text-foreground">
            {fmt(result.totalAllocated)}
          </p>
        </div>
        <div className="hairline bg-surface p-5">
          <p className="label">Cash retained</p>
          <p className="display tabular mt-2 text-2xl text-foreground">
            {fmt(result.cashRetained)}
          </p>
          {result.cashRetainedReason ? (
            <p className="mt-1 text-xs text-muted">
              {result.cashRetainedReason}
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-subtle">
        Generated{" "}
        {new Date(result.generatedAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}
        . This is AI-generated analysis, not financial advice.
      </p>
    </div>
  );
}
