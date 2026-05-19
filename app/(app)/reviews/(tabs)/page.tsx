import { ClipboardCheck } from "lucide-react";
import { Suspense } from "react";
import { ReviewCard } from "@/components/reviews/review-card";
import { ReviewFilters } from "@/components/reviews/review-filters";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";

type SearchParams = Promise<{ status?: string }>;

const VALID_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED"] as const;
type Status = (typeof VALID_STATUSES)[number];

function parseStatus(value: string | undefined): Status | "all" {
  if (!value || value === "all") return "all";
  return (VALID_STATUSES as readonly string[]).includes(value)
    ? (value as Status)
    : "PENDING";
}

export default function ReviewsPage({ searchParams }: PageProps<"/reviews">) {
  return (
    <div>
      <Suspense fallback={<Skeleton className="h-10 w-72" />}>
        <ReviewFilters />
      </Suspense>

      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <ReviewsList searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function ReviewsList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filter = parseStatus(params.status ?? "PENDING");

  const reviews = await db.review.findMany({
    where: filter === "all" ? undefined : { status: filter },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    include: { instrument: true, portfolio: true },
    take: 100,
  });

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No reviews here"
        description={
          filter === "all"
            ? "Reviews appear when alerts trigger. Configure alerts to populate this queue."
            : "Switch tabs to see reviews in other states."
        }
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {reviews.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}
    </div>
  );
}
