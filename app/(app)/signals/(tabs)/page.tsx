import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/shared/skeleton";
import { CrossSourceLeaderboard } from "@/components/signals/cross-source-leaderboard";

type SearchParams = Promise<{ days?: string }>;

const PERIODS = [
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 180, label: "180d" },
  { days: 365, label: "1y" },
];

export default function SignalsOverviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <OverviewContent searchParams={searchParams} />
    </Suspense>
  );
}

async function OverviewContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { days: daysRaw } = await searchParams;
  const days = Number(daysRaw) > 0 ? Number(daysRaw) : 90;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Tickers with the most combined government + insider activity. Click
          through to break each down on its stock page.
        </p>
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <Link
              key={p.days}
              href={`/signals?days=${p.days}`}
              aria-current={p.days === days ? "page" : undefined}
              className={[
                "hairline px-2 py-1 text-xs transition-colors",
                p.days === days
                  ? "border-border-strong bg-surface-elevated text-foreground"
                  : "bg-surface text-muted hover:text-foreground",
              ].join(" ")}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>
      <CrossSourceLeaderboard since={since} limit={25} />
    </div>
  );
}
