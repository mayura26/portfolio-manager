import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { db } from "@/lib/db";
import { ReviewStatusBadge } from "@/components/reviews/review-status-badge";
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
              <span className="ml-2 text-base text-info">+{inProgressCount} active</span>
            ) : null}
          </p>
        </div>
        <Link
          href="/reviews"
          className="text-xs text-accent hover:underline"
        >
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
            <li key={r.id}>
              <Link
                href={`/reviews/${r.id}`}
                className="group flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ReviewStatusBadge status={r.status} />
                  </div>
                  <p className="mt-1 text-sm text-foreground">
                    {r.instrument ? (
                      <span>
                        <span className="tabular font-medium">{r.instrument.symbol}</span>{" "}
                        <span className="text-muted">{r.instrument.name}</span>
                      </span>
                    ) : r.portfolio ? (
                      r.portfolio.name
                    ) : (
                      <span className="text-muted">General</span>
                    )}
                  </p>
                  <p className="line-clamp-1 text-xs text-muted">{r.triggerReason}</p>
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
