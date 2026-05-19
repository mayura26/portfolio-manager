import { ShieldCheck } from "lucide-react";
import { Suspense } from "react";
import { AuditGapList } from "@/components/reviews/audit-gap-list";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { runSetupAudit } from "@/lib/setup-audit";

export default function PortfolioReviewPage() {
  return (
    <div>
      <div className="mb-6">
        <p className="label">Portfolio review</p>
        <p className="mt-1 max-w-prose text-sm text-muted">
          A sweep of every group, portfolio, target and watched name for setup
          gaps. Resolve what matters; mute what doesn't.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <AuditContent />
      </Suspense>
    </div>
  );
}

async function AuditContent() {
  const result = await runSetupAudit();

  return (
    <div className="flex flex-col gap-6">
      <div className="hairline flex items-center gap-6 bg-surface px-5 py-4">
        <div>
          <p className="display text-3xl text-foreground tabular">
            {result.activeCount}
          </p>
          <p className="label mt-0.5">
            {result.activeCount === 1 ? "open gap" : "open gaps"}
          </p>
        </div>
        <div className="h-10 w-px bg-border" />
        <div>
          <p className="display text-3xl text-muted tabular">
            {result.mutedCount}
          </p>
          <p className="label mt-0.5">muted</p>
        </div>
      </div>

      {result.activeCount === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Setup looks complete"
          description={
            result.mutedCount > 0
              ? "No open gaps. Muted checks are listed below if you want to revisit them."
              : "Every group, portfolio, target and watched name has the data it needs."
          }
        />
      ) : null}

      {result.activeCount > 0 || result.mutedCount > 0 ? (
        <AuditGapList result={result} />
      ) : null}
    </div>
  );
}
