import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { ReviewStatusBadge } from "@/components/reviews/review-status-badge";
import { db } from "@/lib/db";
import { formatRelative } from "@/lib/format";

export async function ReviewsSummary() {
  const [pendingCount, inProgressCount, recent] = await Promise.all([
    db.review.count({ where: { status: "PENDING" } }),
    db.review.count({ where: { status: "IN_PROGRESS" } }),
    db.review.findMany({
      where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 4,
      include: { instrument: true, portfolio: true },
    }),
  ]);

  return (
    <div className="hairline flex flex-col bg-surface-elevated">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="label">Decision queue</p>
          <p className="display tabular mt-1 text-2xl text-foreground">
            {pendingCount}
            <span className="ml-2 text-base text-muted">pending</span>
            {inProgressCount > 0 ? (
              <span className="ml-2 text-base text-info">
                +{inProgressCount} active
              </span>
            ) : null}
          </p>
        </div>
        <Link href="/reviews" className="text-xs text-accent hover:underline">
          Open queue →
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">
          No pending reviews. Triggered alerts will appear here.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {recent.map((r) => (
            <li key={r.id} className="flex items-stretch">
              {r.instrument ? (
                <>
                  <Link
                    href={`/stocks/${encodeURIComponent(r.instrument.yahooSymbol)}`}
                    className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3 hover:bg-surface"
                  >
                    <div className="flex items-center gap-2">
                      <ReviewStatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 text-sm text-foreground">
                      <span className="tabular font-medium">
                        {r.instrument.symbol}
                      </span>{" "}
                      <span className="text-muted">{r.instrument.name}</span>
                    </p>
                    <p className="line-clamp-1 text-xs text-muted">
                      {r.triggerReason}
                    </p>
                  </Link>
                  <Link
                    href={`/reviews/${r.id}`}
                    className="group flex shrink-0 items-center gap-1 border-l border-border px-3 text-xs text-subtle transition-colors hover:bg-surface hover:text-accent"
                    aria-label="View review"
                  >
                    <span className="hidden sm:inline">
                      {formatRelative(r.createdAt)}
                    </span>
                    <ArrowUpRight
                      className="h-4 w-4"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  </Link>
                </>
              ) : (
                <Link
                  href={`/reviews/${r.id}`}
                  className="group flex flex-1 items-center justify-between gap-3 px-4 py-3 hover:bg-surface"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ReviewStatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 text-sm text-foreground">
                      {r.portfolio ? (
                        r.portfolio.name
                      ) : (
                        <span className="text-muted">General</span>
                      )}
                    </p>
                    <p className="line-clamp-1 text-xs text-muted">
                      {r.triggerReason}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-subtle">
                    <span>{formatRelative(r.createdAt)}</span>
                    <ArrowUpRight
                      className="h-4 w-4 text-subtle transition-colors group-hover:text-accent"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  </div>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ReviewsSummarySkeleton() {
  return (
    <div className="hairline animate-pulse bg-surface p-4">
      <div className="h-32" />
    </div>
  );
}
