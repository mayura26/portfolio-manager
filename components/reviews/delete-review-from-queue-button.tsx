"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { deleteReviewFromQueue } from "@/actions/reviews";

type Props = {
  reviewId: string;
};

export function DeleteReviewFromQueueButton({ reviewId }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => {
        if (!window.confirm("Delete this review?")) return;
        startTransition(() => {
          void deleteReviewFromQueue(reviewId);
        });
      }}
      disabled={pending}
      title="Delete review"
      aria-label="Delete review"
      className="shrink-0 text-subtle transition-colors hover:text-loss disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
    </button>
  );
}
