"use client";

import { useActionState, useTransition } from "react";
import Link from "next/link";
import { completeReview, deleteReview, reopenReview, startReview } from "@/actions/reviews";
import type { ReviewActionState } from "@/actions/reviews";

type Props = {
  reviewId: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  defaults?: { action?: string; notes?: string };
};

export function ReviewActionForm({ reviewId, status, defaults }: Props) {
  const completeAction = completeReview.bind(null, reviewId);
  const [state, formAction, pending] = useActionState<ReviewActionState | undefined, FormData>(
    completeAction,
    undefined,
  );
  const [transitioning, startTransition] = useTransition();

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  if (status === "PENDING") {
    return (
      <div className="hairline flex flex-col gap-3 bg-surface p-4">
        <p className="text-sm text-muted">
          This review is pending. Start it to record a decision.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              startTransition(() => {
                void startReview(reviewId);
              })
            }
            disabled={transitioning}
            className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {transitioning ? "Starting…" : "Start review"}
          </button>
          <DangerButton reviewId={reviewId} pending={transitioning} startTransition={startTransition} />
        </div>
      </div>
    );
  }

  if (status === "COMPLETED") {
    return (
      <div className="hairline flex flex-col gap-3 bg-surface p-4">
        <p className="text-sm text-muted">Review complete.</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              startTransition(() => {
                void reopenReview(reviewId);
              })
            }
            disabled={transitioning}
            className="hairline px-4 py-2 text-sm text-foreground transition-colors hover:bg-surface-elevated disabled:opacity-50"
          >
            {transitioning ? "Reopening…" : "Reopen"}
          </button>
          <Link href="/reviews" className="px-4 py-2 text-sm text-muted hover:text-foreground">
            Back to queue
          </Link>
          <DangerButton reviewId={reviewId} pending={transitioning} startTransition={startTransition} />
        </div>
      </div>
    );
  }

  // IN_PROGRESS
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state && !state.ok ? (
        <div
          className="hairline border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="action" className="label">
          Decision
        </label>
        <select
          id="action"
          name="action"
          required
          defaultValue={defaults?.action ?? ""}
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="">— Select —</option>
          <option value="HOLD">Hold</option>
          <option value="BUY">Buy more</option>
          <option value="SELL">Sell / trim</option>
          <option value="WATCH">Watch and reassess</option>
          <option value="OTHER">Other</option>
        </select>
        {fieldErrors?.action?.[0] ? (
          <p className="text-xs text-loss">{fieldErrors.action[0]}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="notes" className="label">
          Reasoning
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={5}
          maxLength={2000}
          defaultValue={defaults?.notes ?? ""}
          placeholder="Capture the rationale for this decision: what changed, what didn't, conviction."
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        />
        {fieldErrors?.notes?.[0] ? (
          <p className="text-xs text-loss">{fieldErrors.notes[0]}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Complete review"}
        </button>
        <Link href="/reviews" className="px-4 py-2 text-sm text-muted hover:text-foreground">
          Cancel
        </Link>
        <DangerButton reviewId={reviewId} pending={transitioning} startTransition={startTransition} />
      </div>
    </form>
  );
}

function DangerButton({
  reviewId,
  pending,
  startTransition,
}: {
  reviewId: string;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!window.confirm("Delete this review?")) return;
        startTransition(() => {
          void deleteReview(reviewId);
        });
      }}
      disabled={pending}
      className="ml-auto px-3 py-1.5 text-xs text-loss hover:underline disabled:opacity-50"
    >
      Delete
    </button>
  );
}
