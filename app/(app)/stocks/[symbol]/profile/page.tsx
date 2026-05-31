import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/shared/skeleton";
import { InstrumentProfileForm } from "@/components/stocks/instrument-profile-form";
import { db } from "@/lib/db";
import { resolveInstrumentYahooSymbolFromUrlPath } from "@/lib/instruments";

type Params = Promise<{ symbol: string }>;

export default function StockProfilePage({
  params,
}: PageProps<"/stocks/[symbol]/profile">) {
  return (
    <Suspense fallback={<Skeleton className="h-56 w-full" />}>
      <StockProfileContent params={params} />
    </Suspense>
  );
}

async function StockProfileContent({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = await resolveInstrumentYahooSymbolFromUrlPath(symbol);
  if (!yahooSymbol) notFound();

  const instrument = await db.instrument.findUnique({
    where: { yahooSymbol },
    select: {
      id: true,
      sector: true,
      industry: true,
      instrumentType: true,
    },
  });
  if (!instrument) notFound();

  return <InstrumentProfileForm instrument={instrument} />;
}
