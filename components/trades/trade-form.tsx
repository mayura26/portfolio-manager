"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { TradeActionState } from "@/actions/trades";
import { CurrencySelect } from "@/components/shared/currency-select";
import { DatePicker } from "@/components/shared/date-picker";
import { TickerSearch } from "@/components/trades/ticker-search";

type Defaults = {
  yahooSymbol?: string;
  symbolDisplay?: string;
  type?: "BUY" | "SELL";
  quantity?: string;
  price?: string;
  currency?: string;
  fees?: string;
  date?: string;
  notes?: string | null;
};

type Props = {
  action: (
    state: TradeActionState | undefined,
    formData: FormData,
  ) => Promise<TradeActionState>;
  portfolioId: string;
  baseCurrency: string;
  defaults?: Defaults;
  submitLabel: string;
  cancelHref: string;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TradeForm({
  action,
  portfolioId,
  baseCurrency,
  defaults,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState<
    TradeActionState | undefined,
    FormData
  >(action, undefined);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6">
      <input type="hidden" name="portfolioId" value={portfolioId} />

      {state && !state.ok ? (
        <div
          className="hairline border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

      <Field
        id="yahooSymbol"
        label="Instrument"
        error={fieldErrors?.yahooSymbol?.[0]}
      >
        <TickerSearch
          name="yahooSymbol"
          defaultYahooSymbol={defaults?.yahooSymbol}
          defaultDisplayLabel={defaults?.symbolDisplay}
          onSelect={(hit) => {
            // Default trade currency to the instrument's exchange currency hint via symbol suffix
            // is unreliable; let the user confirm currency below. We still default if currency
            // hasn't been explicitly chosen yet.
            void hit;
          }}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field id="type" label="Side" error={fieldErrors?.type?.[0]}>
          <select
            id="type"
            name="type"
            defaultValue={defaults?.type ?? "BUY"}
            className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
          >
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
          </select>
        </Field>
        <Field id="date" label="Date" error={fieldErrors?.date?.[0]}>
          <DatePicker
            name="date"
            defaultValue={defaults?.date ?? todayIsoDate()}
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          id="quantity"
          label="Quantity"
          error={fieldErrors?.quantity?.[0]}
        >
          <input
            id="quantity"
            name="quantity"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            required
            defaultValue={defaults?.quantity ?? ""}
            className="hairline tabular w-full bg-surface px-3 py-2 text-sm text-foreground"
          />
        </Field>
        <Field
          id="price"
          label="Price per share"
          error={fieldErrors?.price?.[0]}
        >
          <input
            id="price"
            name="price"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            required
            defaultValue={defaults?.price ?? ""}
            className="hairline tabular w-full bg-surface px-3 py-2 text-sm text-foreground"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          id="currency"
          label="Trade currency"
          hint={`Non-${baseCurrency} trades are converted to ${baseCurrency} at the rate on the trade date.`}
          error={fieldErrors?.currency?.[0]}
        >
          <CurrencySelect
            id="currency"
            name="currency"
            defaultValue={defaults?.currency ?? baseCurrency}
            required
          />
        </Field>
        <Field
          id="fees"
          label="Fees (in trade currency)"
          error={fieldErrors?.fees?.[0]}
        >
          <input
            id="fees"
            name="fees"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            defaultValue={defaults?.fees ?? "0"}
            className="hairline tabular w-full bg-surface px-3 py-2 text-sm text-foreground"
          />
        </Field>
      </div>

      <Field id="notes" label="Notes" error={fieldErrors?.notes?.[0]}>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={1000}
          defaultValue={defaults?.notes ?? ""}
          placeholder="Why this trade? Reasoning, source, target."
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Cancel
        </Link>
        {state?.ok ? <span className="text-sm text-gain">Saved</span> : null}
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
