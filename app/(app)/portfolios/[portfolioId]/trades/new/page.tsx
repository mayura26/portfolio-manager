import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createTrade } from "@/actions/trades";
import { Skeleton } from "@/components/shared/skeleton";
import { TradeForm } from "@/components/trades/trade-form";
import { db } from "@/lib/db";

type Params = Promise<{ portfolioId: string }>;

export default function NewTradePage({
  params,
}: PageProps<"/portfolios/[portfolioId]/trades/new">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-xl" />}>
      <NewTradeContent params={params} />
    </Suspense>
  );
}

async function NewTradeContent({ params }: { params: Params }) {
  const { portfolioId } = await params;
  const portfolio = await db.portfolio.findUnique({
    where: { id: portfolioId },
  });
  if (!portfolio) notFound();

  return (
    <div>
      <nav className="label mb-6">
        <Link
          href={`/portfolios/${portfolio.id}/trades`}
          className="text-muted hover:text-foreground"
        >
          Trades
        </Link>{" "}
        / New
      </nav>
      <h2 className="display mb-6 text-3xl text-foreground">Record trade</h2>
      <TradeForm
        action={createTrade}
        portfolioId={portfolio.id}
        baseCurrency={portfolio.baseCurrency}
        defaults={{ currency: portfolio.baseCurrency }}
        submitLabel="Record trade"
        cancelHref={`/portfolios/${portfolio.id}/trades`}
      />
    </div>
  );
}
