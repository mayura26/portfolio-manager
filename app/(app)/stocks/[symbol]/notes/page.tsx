import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/shared/skeleton";
import { StockNotesEditor } from "@/components/stocks/stock-notes-editor";
import { db } from "@/lib/db";
import { resolveInstrumentYahooSymbolFromUrlPath } from "@/lib/instruments";

type Params = Promise<{ symbol: string }>;

export default function StockNotesPage({
  params,
}: PageProps<"/stocks/[symbol]/notes">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <StockNotesContent params={params} />
    </Suspense>
  );
}

async function StockNotesContent({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) notFound();
  const instrument = await db.instrument.findUnique({
    where: { yahooSymbol },
    include: {
      notes: { orderBy: { updatedAt: "desc" } },
    },
  });
  if (!instrument) notFound();

  return (
    <StockNotesEditor instrumentId={instrument.id} notes={instrument.notes} />
  );
}
