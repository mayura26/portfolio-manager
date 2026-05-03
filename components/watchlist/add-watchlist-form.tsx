"use client";

import { useActionState } from "react";
import Link from "next/link";
import { TickerSearch } from "@/components/trades/ticker-search";
import type { WatchlistActionState } from "@/actions/watchlist";

type Props = {
  action: (
    state: WatchlistActionState | undefined,
    formData: FormData,
  ) => Promise<WatchlistActionState>;
};

export function AddWatchlistForm({ action }: Props) {
  const [state, formAction, pending] = useActionState<WatchlistActionState | undefined, FormData>(
    action,
    undefined,
  );

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6">
      {state && !state.ok ? (
        <div
          className="hairline border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

      <Field id="yahooSymbol" label="Stock">
        <TickerSearch name="yahooSymbol" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field id="buyRangeLow" label="Buy range low" hint="Optional" error={fieldErrors?.buyRangeLow?.[0]}>
          <input
            id="buyRangeLow"
            name="buyRangeLow"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            defaultValue=""
            className="hairline tabular w-full bg-surface px-3 py-2 text-sm text-foreground"
          />
        </Field>

        <Field
          id="buyRangeHigh"
          label="Buy range high"
          hint="Alert fires when price falls below this"
          error={fieldErrors?.buyRangeHigh?.[0]}
        >
          <input
            id="buyRangeHigh"
            name="buyRangeHigh"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            defaultValue=""
            className="hairline tabular w-full bg-surface px-3 py-2 text-sm text-foreground"
          />
        </Field>
      </div>

      <Field id="notes" label="Notes" hint="Optional" error={fieldErrors?.notes?.[0]}>
        <input
          id="notes"
          name="notes"
          type="text"
          maxLength={1000}
          defaultValue=""
          placeholder="Why are you watching this stock?"
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        />
      </Field>

      <p className="text-xs text-subtle">
        You can leave the buy range empty and use the <strong>Analyse</strong> button on the
        watchlist card to get an AI-suggested buy zone.
      </p>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add to watchlist"}
        </button>
        <Link href="/watchlist" className="px-4 py-2 text-sm text-muted hover:text-foreground">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-subtle">{hint}</p> : null}
      {error ? <p className="text-xs text-loss">{error}</p> : null}
    </div>
  );
}
