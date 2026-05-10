"use client";

import { useActionState } from "react";
import { type SettingsActionState, updateSettings } from "@/actions/settings";
import { CurrencySelect } from "@/components/shared/currency-select";

type Portfolio = { id: string; name: string };

type Props = {
  defaults: {
    defaultBaseCurrency: string;
    watchlistAiModel: string;
    watchlistAiReasoning: string;
    ibkrFlexToken?: string;
    ibkrFlexQueryId?: string;
    ibkrPortfolioId?: string;
  };
  portfolios?: Portfolio[];
};

export function SettingsForm({ defaults, portfolios = [] }: Props) {
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

      <div className="border-t border-border pt-6">
        <h3 className="display mb-4 text-lg text-foreground">
          Interactive Brokers
        </h3>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="ibkrFlexToken" className="label">
              Flex Token
            </label>
            <input
              id="ibkrFlexToken"
              name="ibkrFlexToken"
              type="password"
              defaultValue={defaults.ibkrFlexToken ?? ""}
              placeholder="Your IBKR Flex Web Service token"
              className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle"
              autoComplete="off"
            />
            <p className="text-xs text-subtle">
              Found in IBKR Account Management → Reports → Flex Queries → Manage
              Service.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="ibkrFlexQueryId" className="label">
              Flex Query ID
            </label>
            <input
              id="ibkrFlexQueryId"
              name="ibkrFlexQueryId"
              type="text"
              defaultValue={defaults.ibkrFlexQueryId ?? ""}
              placeholder="e.g. 123456"
              className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle"
            />
            <p className="text-xs text-subtle">
              Create a Flex Query in IBKR for Trades with{" "}
              <strong>XML</strong> format and copy the Query ID here.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="ibkrPortfolioId" className="label">
              Default portfolio for Flex sync
            </label>
            <select
              id="ibkrPortfolioId"
              name="ibkrPortfolioId"
              defaultValue={defaults.ibkrPortfolioId ?? ""}
              className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
            >
              <option value="">— select a portfolio —</option>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-subtle">
              Used by the scheduled Flex sync cron job.
            </p>
          </div>
        </div>
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
