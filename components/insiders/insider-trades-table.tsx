import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { getFilteredInsiderTrades } from "@/lib/insider-trades";
import type { InsiderFilters } from "@/lib/validators";

const PAGE_SIZE = 50;

type Props = {
  filters: InsiderFilters;
};

function transactionBadge(tx: string) {
  const lower = tx.toLowerCase();
  if (lower.includes("purchase")) {
    return (
      <span className="inline-block rounded-sm bg-gain/10 px-1.5 py-0.5 text-xs font-medium text-gain">
        {tx}
      </span>
    );
  }
  if (lower.includes("sale")) {
    return (
      <span className="inline-block rounded-sm bg-loss/10 px-1.5 py-0.5 text-xs font-medium text-loss">
        {tx}
      </span>
    );
  }
  return <span className="text-xs text-muted">{tx}</span>;
}

export async function InsiderTradesTable({ filters }: Props) {
  const since = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000);

  const { trades, total } = await getFilteredInsiderTrades({
    since,
    ticker: filters.ticker,
    transaction: filters.transaction,
    page: filters.page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = filters.page;

  function pageHref(p: number) {
    const params = new URLSearchParams({
      days: String(filters.days),
      ...(filters.ticker ? { ticker: filters.ticker } : {}),
      ...(filters.transaction ? { transaction: filters.transaction } : {}),
      page: String(p),
    });
    return `/signals/insiders?${params.toString()}`;
  }

  return (
    <div className="hairline bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-5 py-2 text-xs font-normal text-muted">Date</th>
              <th className="px-5 py-2 text-xs font-normal text-muted">
                Insider
              </th>
              <th className="px-5 py-2 text-xs font-normal text-muted">
                Ticker
              </th>
              <th className="px-5 py-2 text-xs font-normal text-muted">Type</th>
              <th className="px-5 py-2 text-right text-xs font-normal text-muted">
                Shares
              </th>
              <th className="hidden px-5 py-2 text-right text-xs font-normal text-muted lg:table-cell">
                Price
              </th>
              <th className="px-5 py-2 text-right text-xs font-normal text-muted">
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-10 text-center text-sm text-muted"
                >
                  No insider trades for this period. Form 4 data populates from
                  the scheduled insider-trades sync (Data sync page) for tickers
                  you hold or watch.
                </td>
              </tr>
            ) : (
              trades.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-border last:border-0 hover:bg-surface-elevated"
                >
                  <td className="whitespace-nowrap px-5 py-2.5 tabular text-xs text-muted">
                    {formatDate(t.transactionDate)}
                  </td>
                  <td className="px-5 py-2.5">
                    <span className="text-foreground">{t.insiderName}</span>
                    {t.insiderTitle ? (
                      <p className="mt-0.5 max-w-[180px] truncate text-xs text-subtle">
                        {t.insiderTitle}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/stocks/${t.ticker}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {t.ticker}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5">
                    {transactionBadge(t.transaction)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular text-xs text-muted">
                    {t.shares != null
                      ? formatNumber(t.shares, { decimals: 0 })
                      : "—"}
                  </td>
                  <td className="hidden px-5 py-2.5 text-right tabular text-xs text-muted lg:table-cell">
                    {t.pricePerShare != null
                      ? formatCurrency(t.pricePerShare, "USD")
                      : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular text-xs text-muted">
                    {t.value != null
                      ? formatCurrency(t.value, "USD", { compact: true })
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-xs text-muted">
            {total.toLocaleString()} total · page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            {currentPage > 1 ? (
              <Link
                href={pageHref(currentPage - 1)}
                className="hairline inline-flex items-center gap-1 px-3 py-1.5 text-xs text-foreground hover:bg-surface-elevated"
              >
                <ChevronLeft className="h-3 w-3" />
                Prev
              </Link>
            ) : null}
            {currentPage < totalPages ? (
              <Link
                href={pageHref(currentPage + 1)}
                className="hairline inline-flex items-center gap-1 px-3 py-1.5 text-xs text-foreground hover:bg-surface-elevated"
              >
                Next
                <ChevronRight className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
