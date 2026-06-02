"use client";

import { useActionState } from "react";
import { type SettingsActionState, updateSettings } from "@/actions/settings";
import { CurrencySelect } from "@/components/shared/currency-select";

type Props = {
  defaults: {
    defaultBaseCurrency: string;
    watchlistAiModel: string;
    watchlistAiReasoning: string;
    minTradePercent: number;
  };
};

export function SettingsForm({ defaults }: Props) {
  const [state, formAction, pending] = useActionState<
    SettingsActionState | undefined,
    FormData
  >(updateSettings, undefined);

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
          Pre-selected when creating new portfolios. Existing portfolios keep
          their own currency.
        </p>
        {fieldErrors?.defaultBaseCurrency?.[0] ? (
          <p className="text-xs text-loss">
            {fieldErrors.defaultBaseCurrency[0]}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="watchlistAiModel" className="label">
          Watchlist AI model
        </label>
        <select
          id="watchlistAiModel"
          name="watchlistAiModel"
          defaultValue={defaults.watchlistAiModel}
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="gpt-5.4">
            gpt-5.4 — higher quality, 250K tokens/day free quota
          </option>
          <option value="gpt-5.4-mini">
            gpt-5.4-mini — faster, 2.5M tokens/day free quota
          </option>
        </select>
        <p className="text-xs text-subtle">
          Used when you click <strong>Analyse</strong> on a watchlist item to
          suggest a buy zone.
        </p>
        {fieldErrors?.watchlistAiModel?.[0] ? (
          <p className="text-xs text-loss">{fieldErrors.watchlistAiModel[0]}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="watchlistAiReasoning" className="label">
          Reasoning effort
        </label>
        <select
          id="watchlistAiReasoning"
          name="watchlistAiReasoning"
          defaultValue={defaults.watchlistAiReasoning}
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="minimal">Minimal — fastest, shallowest</option>
          <option value="low">Low</option>
          <option value="medium">Medium (default)</option>
          <option value="high">High — slowest, most thorough</option>
        </select>
        <p className="text-xs text-subtle">
          Higher reasoning produces more considered analysis but uses more
          tokens and takes longer.
        </p>
        {fieldErrors?.watchlistAiReasoning?.[0] ? (
          <p className="text-xs text-loss">
            {fieldErrors.watchlistAiReasoning[0]}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="minTradePercent" className="label">
          Minimum trade size (%)
        </label>
        <input
          id="minTradePercent"
          name="minTradePercent"
          type="number"
          step="0.01"
          min="0"
          max="100"
          defaultValue={defaults.minTradePercent}
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        />
        <p className="text-xs text-subtle">
          Smallest allocation as a percentage of total group value. The AI
          invest tool won&apos;t suggest any single trade below this threshold,
          preventing lots of tiny positions.
        </p>
        {fieldErrors?.minTradePercent?.[0] ? (
          <p className="text-xs text-loss">{fieldErrors.minTradePercent[0]}</p>
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
