"use client";

import { useActionState } from "react";
import { setBuyRange } from "@/actions/watchlist";
import type { WatchlistActionState } from "@/actions/watchlist";

type Props = {
  itemId: string;
  currentLow?: string | null;
  currentHigh?: string | null;
  onSaved?: () => void;
};

export function BuyRangeForm({ itemId, currentLow, currentHigh, onSaved }: Props) {
  const boundAction = setBuyRange.bind(null, itemId);
  const [state, formAction, pending] = useActionState<WatchlistActionState | undefined, FormData>(
    boundAction,
    undefined,
  );

  if (state?.ok && onSaved) {
    onSaved();
  }

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state && !state.ok ? (
        <p className="text-xs text-loss">{state.error}</p>
      ) : null}

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`low-${itemId}`} className="label text-xs">
            Range low
          </label>
          <input
            id={`low-${itemId}`}
            name="buyRangeLow"
            type="number"
            inputMode="decimal"
            step="any"
            required
            defaultValue={currentLow ?? ""}
            className="hairline tabular w-28 bg-surface px-2 py-1 text-sm text-foreground"
          />
          {fieldErrors?.buyRangeLow ? (
            <p className="text-xs text-loss">{fieldErrors.buyRangeLow[0]}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`high-${itemId}`} className="label text-xs">
            Range high
          </label>
          <input
            id={`high-${itemId}`}
            name="buyRangeHigh"
            type="number"
            inputMode="decimal"
            step="any"
            required
            defaultValue={currentHigh ?? ""}
            className="hairline tabular w-28 bg-surface px-2 py-1 text-sm text-foreground"
          />
          {fieldErrors?.buyRangeHigh ? (
            <p className="text-xs text-loss">{fieldErrors.buyRangeHigh[0]}</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-3 py-1 text-xs text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
