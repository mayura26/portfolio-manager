import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { AlertCard } from "@/components/alerts/alert-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";

type Params = Promise<{ portfolioId: string }>;

export default function PortfolioAlertsPage({
  params,
}: PageProps<"/portfolios/[portfolioId]/alerts">) {
  return (
    <Suspense fallback={<Skeleton className="h-48 w-full" />}>
      <PortfolioAlerts params={params} />
    </Suspense>
  );
}

async function PortfolioAlerts({ params }: { params: Params }) {
  const { portfolioId } = await params;
  const portfolio = await db.portfolio.findUnique({
    where: { id: portfolioId },
    include: {
      alerts: {
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: { instrument: true, portfolio: true },
      },
    },
  });
  if (!portfolio) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {portfolio.alerts.length} {portfolio.alerts.length === 1 ? "alert" : "alerts"}
        </p>
        <Link
          href={`/portfolios/${portfolio.id}/alerts/new`}
          className="inline-flex items-center gap-2 bg-accent px-3 py-1.5 text-xs text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          Add alert
        </Link>
      </div>

      {portfolio.alerts.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No alerts on this portfolio"
          description="Set price targets, percent triggers, or periodic review reminders."
          action={{
            href: `/portfolios/${portfolio.id}/alerts/new`,
            label: "Create alert",
          }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {portfolio.alerts.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </div>
      )}
    </div>
  );
}
