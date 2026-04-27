import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Skeleton } from "@/components/shared/skeleton";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/format";

type Params = Promise<{ symbol: string }>;

export default function StockTradesPage({ params }: PageProps<"/stocks/[symbol]/trades">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <StockTradesContent params={params} />
    </Suspense>
  );
}

async function StockTradesContent({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = decodeURIComponent(symbol).toUpperCase();
  const instrument = await db.instrument.findUnique({
    where: { yahooSymbol },
    include: {
      trades: {
        orderBy: { date: "desc" },
        include: { portfolio: true },
      },
    },
  });
  if (!instrument) notFound();

  if (instrument.trades.length === 0) {
    return <p className="text-sm text-muted">No trades yet for this instrument.</p>;
  }

  return (
    <div className="hairline overflow-x-auto bg-surface-elevated">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="label px-3 py-3">Date</th>
            <th className="label px-3 py-3">Portfolio</th>
            <th className="label px-3 py-3">Side</th>
            <th className="label px-3 py-3 text-right">Quantity</th>
            <th className="label px-3 py-3 text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          {instrument.trades.map((trade) => (
            <tr key={trade.id} className="border-b border-border last:border-b-0">
              <td className="px-3 py-3">
                <span className="tabular text-muted">{formatDate(trade.date)}</span>
              </td>
              <td className="px-3 py-3">
                <Link
                  href={`/portfolios/${trade.portfolioId}/trades/${trade.id}`}
                  className="text-foreground hover:text-accent"
                >
                  {trade.portfolio.name}
                </Link>
              </td>
              <td className="px-3 py-3">
                <span
                  className={[
                    "label inline-flex items-center px-2 py-0.5",
                    trade.type === "BUY"
                      ? "border border-gain/30 bg-gain-soft text-gain"
                      : "border border-loss/30 bg-loss-soft text-loss",
                  ].join(" ")}
                >
                  {trade.type}
                </span>
              </td>
              <td className="px-3 py-3 text-right">
                <span className="tabular">{formatQuantity(trade.quantity.toString())}</span>
              </td>
              <td className="px-3 py-3 text-right">
                <span className="tabular">{formatCurrency(trade.price.toString(), trade.currency)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
