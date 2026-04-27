import { Suspense } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { StockNotesEditor } from "@/components/stocks/stock-notes-editor";
import { Skeleton } from "@/components/shared/skeleton";

type Params = Promise<{ symbol: string }>;

export default function StockNotesPage({ params }: PageProps<"/stocks/[symbol]/notes">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <StockNotesContent params={params} />
    </Suspense>
  );
}

async function StockNotesContent({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = decodeURIComponent(symbol).toUpperCase();
  const instrument = await db.instrument.findUnique({
    where: { yahooSymbol },
    include: {
      notes: { orderBy: { updatedAt: "desc" } },
    },
  });
  if (!instrument) notFound();

  return <StockNotesEditor instrumentId={instrument.id} notes={instrument.notes} />;
}
