import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { createAlert } from "@/actions/alerts";
import { AlertForm } from "@/components/alerts/alert-form";
import { Skeleton } from "@/components/shared/skeleton";

export default function NewAlertPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <nav className="label mb-6">
        <Link href="/alerts" className="text-muted hover:text-foreground">
          Alerts
        </Link>{" "}
        / New
      </nav>
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="display text-4xl text-foreground">New alert</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Choose a trigger type and a target. Triggered alerts create a pending review.
        </p>
      </header>

      <Suspense fallback={<Skeleton className="h-72 w-full max-w-xl" />}>
        <NewAlertContent />
      </Suspense>
    </div>
  );
}

async function NewAlertContent() {
  const portfolios = await db.portfolio.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <AlertForm
      action={createAlert}
      portfolios={portfolios}
      cancelHref="/alerts"
    />
  );
}
