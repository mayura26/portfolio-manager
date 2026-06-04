import { Radar } from "lucide-react";
import { type ReactNode, Suspense } from "react";
import { Skeleton } from "@/components/shared/skeleton";
import { SignalsSectionTabs } from "@/components/signals/signals-section-tabs";

export default function SignalsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 border-b border-border pb-6">
        <p className="label">Intelligence</p>
        <h1 className="display mt-2 text-4xl text-foreground">
          <span className="inline-flex items-center gap-3">
            <Radar className="h-8 w-8 text-muted" strokeWidth={1} />
            Smart Money
          </span>
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Congressional (House &amp; Senate) and corporate-insider trade
          disclosures — blended in one place to spot where the smart money is
          moving.
        </p>
      </header>

      <Suspense fallback={<Skeleton className="h-9 w-72" />}>
        <SignalsSectionTabs />
      </Suspense>

      <div className="mt-6">{children}</div>
    </div>
  );
}
