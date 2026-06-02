"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import type { ReviewActionState } from "@/actions/reviews";
import {
  completeReview,
  deleteReview,
  reopenReview,
  startReview,
} from "@/actions/reviews";

type Props = {
  reviewId: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  defaults?: { action?: string; notes?: string };
  targetAdjustment?: {
    direction: "buy" | "sell";
    currentPrice: string;
  };
};

export function ReviewActionForm({
  reviewId,
  status,
  defaults,
  targetAdjustment,
}: Props) {
  const completeAction = completeReview.bind(null, reviewId);
  const [state, formAction, pending] = useActionState<
    ReviewActionState | undefined,
    FormData
  >(completeAction, undefined);
  const [transitioning, startTransition] = useTransition();
  const [action, setAction] = useState(defaults?.action ?? "");

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const adjustingTarget = action === "ADJUST_TARGET" && targetAdjustment;

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
          <DangerButton
            reviewId={reviewId}
            pending={transitioning}
            startTransition={startTransition}
          />
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
          <Link
            href="/reviews"
            className="px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Back to queue
          </Link>
          <DangerButton
            reviewId={reviewId}
            pending={transitioning}
            startTransition={startTransition}
          />
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
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="">— Select —</option>
          <option value="HOLD">Hold</option>
          <option value="BUY">Buy more</option>
          <option value="SELL">Sell / trim</option>
          <option value="WATCH">Watch and reassess</option>
          {targetAdjustment ? (
            <option value="ADJUST_TARGET">Adjust target</option>
          ) : null}
          <option value="OTHER">Other</option>
        </select>
        {fieldErrors?.action?.[0] ? (
          <p className="text-xs text-loss">{fieldErrors.action[0]}</p>
        ) : null}
      </div>

      {adjustingTarget ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="adjustedTargetPrice" className="label">
            New {targetAdjustment.direction} target
          </label>
          <input
            id="adjustedTargetPrice"
            name="adjustedTargetPrice"
            type="number"
            inputMode="decimal"
            step="any"
            required
            defaultValue={targetAdjustment.currentPrice}
            className="hairline tabular w-full bg-surface px-3 py-2 text-sm text-foreground"
          />
          {fieldErrors?.adjustedTargetPrice?.[0] ? (
            <p className="text-xs text-loss">
              {fieldErrors.adjustedTargetPrice[0]}
            </p>
          ) : null}
        </div>
      ) : null}

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
        <Link
          href="/reviews"
          className="px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Cancel
        </Link>
        <DangerButton
          reviewId={reviewId}
          pending={transitioning}
          startTransition={startTransition}
        />
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
