import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { deleteTrade, updateTrade } from "@/actions/trades";
import { TradeForm } from "@/components/trades/trade-form";
import { DeleteTradeButton } from "@/components/trades/delete-trade-button";
import { Skeleton } from "@/components/shared/skeleton";

type Params = Promise<{ portfolioId: string; tradeId: string }>;

export default function EditTradePage({
  params,
}: PageProps<"/portfolios/[portfolioId]/trades/[tradeId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-xl" />}>
      <EditTradeContent params={params} />
    </Suspense>
  );
}

async function EditTradeContent({ params }: { params: Params }) {
  const { portfolioId, tradeId } = await params;
  const trade = await db.trade.findUnique({
    where: { id: tradeId },
    include: { instrument: true, portfolio: true },
  });
  if (!trade || trade.portfolioId !== portfolioId) notFound();

  const updateAction = updateTrade.bind(null, trade.id);
  const deleteAction = deleteTrade.bind(null, trade.id);

  return (
    <div className="flex flex-col gap-12">
      <section>
        <nav className="label mb-6">
          <Link
            href={`/portfolios/${trade.portfolioId}/trades`}
            className="text-muted hover:text-foreground"
          >
            Trades
          </Link>{" "}
          / Edit
        </nav>
        <h2 className="display mb-6 text-3xl text-foreground">Edit trade</h2>
        <TradeForm
          action={updateAction}
          portfolioId={trade.portfolioId}
          baseCurrency={trade.portfolio.baseCurrency}
          defaults={{
            yahooSymbol: trade.instrument.yahooSymbol,
            symbolDisplay: `${trade.instrument.symbol} — ${trade.instrument.name}`,
            type: trade.type,
            quantity: trade.quantity.toString(),
            price: trade.price.toString(),
            currency: trade.currency,
            fees: trade.fees.toString(),
            date: trade.date.toISOString().slice(0, 10),
            notes: trade.notes,
          }}
          submitLabel="Save changes"
          cancelHref={`/portfolios/${trade.portfolioId}/trades`}
        />
      </section>

      <section>
        <h2 className="display mb-2 text-2xl text-loss">Danger zone</h2>
        <p className="mb-4 max-w-prose text-sm text-muted">
          Deleting a trade re-runs the FIFO accounting and may change cost basis and realized P&L.
        </p>
        <DeleteTradeButton action={deleteAction} />
      </section>
    </div>
  );
}
