"use client";

import { useActionState } from "react";
import { CurrencySelect } from "@/components/shared/currency-select";
import { updateSettings, type SettingsActionState } from "@/actions/settings";

type Props = {
  defaults: {
    defaultBaseCurrency: string;
  };
};

export function SettingsForm({ defaults }: Props) {
  const [state, formAction, pending] = useActionState<SettingsActionState | undefined, FormData>(
    updateSettings,
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

      <div className="flex flex-col gap-2">
        <label htmlFor="defaultBaseCurrency" className="label">
          Default base currency
        </label>
        <CurrencySelect
          id="defaultBaseCurrency"
          name="defaultBaseCurrency"
          defaultValue={defaults.defaultBaseCurrency}
          required
        />
        <p className="text-xs text-subtle">
          Pre-selected when creating new portfolios. Existing portfolios keep their own currency.
        </p>
        {fieldErrors?.defaultBaseCurrency?.[0] ? (
          <p className="text-xs text-loss">{fieldErrors.defaultBaseCurrency[0]}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state?.ok ? <span className="text-sm text-gain">Saved</span> : null}
      </div>
    </form>
  );
}
