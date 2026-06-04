import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { getExecutiveTrades } from "@/lib/oge-trades";

const PAGE_SIZE = 50;

type Props = {
  page: number;
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

export async function ExecutiveTradesTable({ page }: Props) {
  const { trades, total, filers } = await getExecutiveTrades({
    page,
    pageSize: PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="hairline bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">
            Executive 278-T disclosures
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Periodic Transaction Reports filed with the Office of Government
            Ethics. Mostly bonds &amp; funds (no tickers); amounts are
            best-effort from OCR'd scans.
          </p>
        </div>
        {filers.map((f) => (
          <span
            key={f}
            className="label hairline inline-flex items-center bg-warning/10 px-2 py-0.5 text-warning"
          >
            {f}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-5 py-2 text-xs font-normal text-muted">Date</th>
              <th className="px-5 py-2 text-xs font-normal text-muted">
                Asset
              </th>
              <th className="hidden px-5 py-2 text-xs font-normal text-muted sm:table-cell">
                Class
              </th>
              <th className="px-5 py-2 text-xs font-normal text-muted">Type</th>
              <th className="px-5 py-2 text-right text-xs font-normal text-muted">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-10 text-center text-sm text-muted"
                >
                  No executive trades yet. Runs from the scheduled trades sync
                  against a curated list of OGE 278-T filings.
                </td>
              </tr>
            ) : (
              trades.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-border last:border-0 hover:bg-surface-elevated"
                >
                  <td className="whitespace-nowrap px-5 py-2.5 tabular text-xs text-muted">
                    {t.transactionDate ? formatDate(t.transactionDate) : "—"}
                  </td>
                  <td className="px-5 py-2.5">
                    <span className="text-foreground">{t.assetName}</span>
                  </td>
                  <td className="hidden px-5 py-2.5 text-xs text-muted sm:table-cell">
                    {t.assetClass ?? "—"}
                  </td>
                  <td className="px-5 py-2.5">
                    {transactionBadge(t.transaction)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular text-xs text-muted">
                    {t.rangeRaw ?? "—"}
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
            {total.toLocaleString()} total · page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={`/signals/executive?page=${page - 1}`}
                className="hairline inline-flex items-center gap-1 px-3 py-1.5 text-xs text-foreground hover:bg-surface-elevated"
              >
                <ChevronLeft className="h-3 w-3" />
                Prev
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={`/signals/executive?page=${page + 1}`}
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
