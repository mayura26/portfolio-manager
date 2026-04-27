import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ReviewActionForm } from "@/components/reviews/review-action-form";
import { ReviewStatusBadge } from "@/components/reviews/review-status-badge";
import { Skeleton } from "@/components/shared/skeleton";
import { formatDate, formatRelative } from "@/lib/format";

type Params = Promise<{ reviewId: string }>;

export default function ReviewDetailPage({ params }: PageProps<"/reviews/[reviewId]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <nav className="label mb-6">
        <Link href="/reviews" className="text-muted hover:text-foreground">
          Reviews
        </Link>{" "}
        / Detail
      </nav>

      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ReviewDetailContent params={params} />
      </Suspense>
    </div>
  );
}

async function ReviewDetailContent({ params }: { params: Params }) {
  const { reviewId } = await params;
  const review = await db.review.findUnique({
    where: { id: reviewId },
    include: {
      instrument: true,
      portfolio: true,
      alert: true,
    },
  });
  if (!review) notFound();

  return (
    <article className="flex flex-col gap-8">
      <header className="border-b border-border pb-6">
        <div className="flex items-center gap-2">
          <ReviewStatusBadge status={review.status} />
          {review.priority > 0 ? (
            <span className="label text-warning">Priority {review.priority}</span>
          ) : null}
        </div>
        <h1 className="display mt-3 text-3xl text-foreground">
          {review.instrument ? (
            <Link
              href={`/stocks/${encodeURIComponent(review.instrument.yahooSymbol)}`}
              className="hover:text-accent"
            >
              <span className="tabular">{review.instrument.symbol}</span>{" "}
              <span className="text-muted">{review.instrument.name}</span>
            </Link>
          ) : review.portfolio ? (
            <Link href={`/portfolios/${review.portfolio.id}`} className="hover:text-accent">
              {review.portfolio.name}
            </Link>
          ) : (
            "General review"
          )}
        </h1>
        <p className="mt-3 text-sm text-muted">{review.triggerReason}</p>
        <p className="label mt-3">
          Opened {formatRelative(review.createdAt)}
          {review.decisionDate ? ` · Decided ${formatDate(review.decisionDate)}` : ""}
        </p>
      </header>

      <ReviewActionForm
        reviewId={review.id}
        status={review.status}
        defaults={{
          action: review.action ?? undefined,
          notes: review.notes ?? undefined,
        }}
      />
    </article>
  );
}
