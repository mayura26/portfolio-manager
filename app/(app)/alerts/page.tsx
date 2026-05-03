import { Bell, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AlertCard } from "@/components/alerts/alert-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";

export default function AlertsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-end justify-between border-b border-border pb-6">
        <div>
          <p className="label">Watchlist</p>
          <h1 className="display mt-2 text-4xl text-foreground">Alerts</h1>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Configurable triggers that produce review tasks and notifications
            when conditions hit.
          </p>
        </div>
        <Link
          href="/alerts/new"
          className="inline-flex items-center gap-2 bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          New alert
        </Link>
      </header>

      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <AlertsList />
      </Suspense>
    </div>
  );
}

async function AlertsList() {
  const alerts = await db.alert.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { instrument: true, portfolio: true },
  });

  if (alerts.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="No alerts yet"
        description="Create alerts on price targets, percent moves, or periodic reviews to drive your decision queue."
        action={{ href: "/alerts/new", label: "Create alert" }}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {alerts.map((a) => (
        <AlertCard key={a.id} alert={a} />
      ))}
    </div>
  );
}
