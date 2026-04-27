import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { AlertCard } from "@/components/alerts/alert-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";

type Params = Promise<{ symbol: string }>;

export default function StockAlertsPage({ params }: PageProps<"/stocks/[symbol]/alerts">) {
  return (
    <Suspense fallback={<Skeleton className="h-48 w-full" />}>
      <StockAlertsContent params={params} />
    </Suspense>
  );
}

async function StockAlertsContent({ params }: { params: Params }) {
  const { symbol } = await params;
  const yahooSymbol = decodeURIComponent(symbol).toUpperCase();
  const instrument = await db.instrument.findUnique({
    where: { yahooSymbol },
    include: {
      alerts: {
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: { instrument: true, portfolio: true },
      },
    },
  });
  if (!instrument) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {instrument.alerts.length} {instrument.alerts.length === 1 ? "alert" : "alerts"}
        </p>
        <Link
          href={`/alerts/new?yahooSymbol=${encodeURIComponent(instrument.yahooSymbol)}`}
          className="inline-flex items-center gap-2 bg-accent px-3 py-1.5 text-xs text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          Add alert
        </Link>
      </div>

      {instrument.alerts.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No alerts on this stock"
          description="Configure price targets or percent moves to get notified when the market shifts."
          action={{
            href: `/alerts/new?yahooSymbol=${encodeURIComponent(instrument.yahooSymbol)}`,
            label: "Create alert",
          }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {instrument.alerts.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </div>
      )}
    </div>
  );
}
