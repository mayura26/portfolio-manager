import { Suspense } from "react";
import { Skeleton } from "@/components/shared/skeleton";
import { ExecutiveTradesTable } from "@/components/signals/executive-trades-table";

type SearchParams = Promise<{ page?: string }>;

export default function ExecutiveTab({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ExecutiveContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ExecutiveContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { page: pageRaw } = await searchParams;
  const page = Number(pageRaw) > 0 ? Number(pageRaw) : 1;
  return <ExecutiveTradesTable page={page} />;
}
