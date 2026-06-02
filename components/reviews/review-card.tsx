import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { formatDate, formatRelative } from "@/lib/format";
import { ReviewStatusBadge } from "./review-status-badge";

type ReviewRow = {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  triggerReason: string;
  notes: string | null;
  action: string | null;
  priority: number;
  decisionDate: Date | null;
  createdAt: Date;
  instrument: { yahooSymbol: string; symbol: string; name: string } | null;
  portfolio: { id: string; name: string } | null;
};

export function ReviewCard({ review }: { review: ReviewRow }) {
  return (
    <Link
      href={`/reviews/${review.id}`}
      className="group hairline flex flex-col gap-3 bg-surface-elevated p-4 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ReviewStatusBadge status={review.status} />
            {review.priority > 0 ? (
              <span className="label text-warning">
                Priority {review.priority}
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 text-base text-foreground">
            {review.instrument ? (
              <span>
                <span className="tabular font-medium">
                  {review.instrument.symbol}
                </span>{" "}
                <span className="text-muted">{review.instrument.name}</span>
              </span>
            ) : review.portfolio ? (
              <span>{review.portfolio.name}</span>
            ) : (
              <span className="text-muted">General</span>
            )}
          </h3>
          <p className="mt-1 text-sm text-muted">{review.triggerReason}</p>
          {review.action ? (
            <p className="mt-2 label">
              Decision: {decisionLabel(review.action)}
            </p>
          ) : null}
        </div>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-accent"
          strokeWidth={1.5}
          aria-hidden
        />
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted">
        <span>Opened {formatRelative(review.createdAt)}</span>
        {review.decisionDate ? (
          <span>Decided {formatDate(review.decisionDate)}</span>
        ) : null}
      </div>
    </Link>
  );
}

function decisionLabel(action: string): string {
  switch (action) {
    case "HOLD":
      return "Hold";
    case "BUY":
      return "Buy more";
    case "SELL":
      return "Sell / trim";
    case "WATCH":
      return "Watch and reassess";
    case "ADJUST_TARGET":
      return "Adjusted target";
    case "OTHER":
      return "Other";
    default:
      return action;
  }
}
