import { type ReactNode, Suspense } from "react";
import { IbkrSyncAlertBar } from "@/components/reviews/ibkr-sync-alert-bar";
import { ReviewSectionTabs } from "@/components/reviews/review-section-tabs";
import { Skeleton } from "@/components/shared/skeleton";

export default function ReviewsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 border-b border-border pb-6">
        <p className="label">Decision desk</p>
        <h1 className="display mt-2 text-4xl text-foreground">Reviews</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Work the action queue, audit your setup for gaps, and read the weekly
          report — all in one deliberate place.
        </p>
      </header>

      <Suspense fallback={null}>
        <IbkrSyncAlertBar />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-9 w-80" />}>
        <ReviewSectionTabs />
      </Suspense>

      <div className="mt-6">{children}</div>
    </div>
  );
}
