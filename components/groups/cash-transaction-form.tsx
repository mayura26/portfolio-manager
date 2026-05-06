"use client";

import { useActionState } from "react";
import { addCashTransaction, type CashActionState } from "@/actions/cash";
import { CurrencySelect } from "@/components/shared/currency-select";

type Props = {
  groupId: string;
  defaultCurrency: string;
};

export function CashTransactionForm({ groupId, defaultCurrency }: Props) {
  const bound = addCashTransaction.bind(null, groupId);
  const [state, formAction, pending] = useActionState<
    CashActionState | undefined,
    FormData
  >(bound, undefined);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={formAction}
      className="hairline flex flex-col gap-4 bg-surface p-4"
    >
      {state && !state.ok ? (
        <div
          className="hairline border-loss/40 bg-loss-soft px-3 py-2 text-sm text-loss"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-5">
        <div className="flex flex-col gap-1">
          <label htmlFor="type" className="label">
            Type
          </label>
          <select
            id="type"
            name="type"
            required
            defaultValue="DEPOSIT"
            className="hairline bg-surface px-2 py-2 text-sm text-foreground"
          >
            <option value="SEED">Seed</option>
            <option value="DEPOSIT">Deposit</option>
            <option value="WITHDRAWAL">Withdrawal</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="amount" className="label">
            Amount
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            className="hairline tabular bg-surface px-2 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="currency" className="label">
            Currency
          </label>
          <CurrencySelect
            id="currency"
            name="currency"
            defaultValue={defaultCurrency}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="date" className="label">
            Date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={today}
            className="hairline tabular bg-surface px-2 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="notes" className="label">
            Notes
          </label>
          <input
            id="notes"
            name="notes"
            type="text"
            maxLength={500}
            className="hairline bg-surface px-2 py-2 text-sm"
          />
        </div>
      </div>

      {fieldErrors ? (
        <ul className="text-xs text-loss">
          {Object.entries(fieldErrors).map(([k, v]) => (
            <li key={k}>
              {k}: {v?.[0]}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Recording…" : "Record cash transaction"}
        </button>
        {state?.ok ? <span className="text-sm text-gain">Recorded</span> : null}
      </div>
    </form>
  );
}
