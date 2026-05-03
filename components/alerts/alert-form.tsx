"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { AlertActionState } from "@/actions/alerts";
import { TickerSearch } from "@/components/trades/ticker-search";

type AlertType =
  | "PRICE_ABOVE"
  | "PRICE_BELOW"
  | "PCT_CHANGE"
  | "REVIEW_TIMER"
  | "ALLOCATION_DRIFT";

type Portfolio = { id: string; name: string };

type Defaults = {
  type?: AlertType;
  yahooSymbol?: string;
  symbolDisplay?: string;
  portfolioId?: string;
  priceTarget?: string;
  pctChange?: string;
  reviewIntervalDays?: string;
  allocationThreshold?: string;
  message?: string;
};

type Props = {
  action: (
    state: AlertActionState | undefined,
    formData: FormData,
  ) => Promise<AlertActionState>;
  portfolios: Portfolio[];
  defaults?: Defaults;
  lockedPortfolioId?: string;
  lockedYahooSymbol?: string;
  lockedSymbolDisplay?: string;
  cancelHref: string;
};

export function AlertForm({
  action,
  portfolios,
  defaults,
  lockedPortfolioId,
  lockedYahooSymbol,
  lockedSymbolDisplay,
  cancelHref,
}: Props) {
  const [type, setType] = useState<AlertType>(defaults?.type ?? "PRICE_ABOVE");
  const [state, formAction, pending] = useActionState<
    AlertActionState | undefined,
    FormData
  >(action, undefined);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  const needsInstrument =
    type === "PRICE_ABOVE" ||
    type === "PRICE_BELOW" ||
    type === "PCT_CHANGE" ||
    type === "ALLOCATION_DRIFT";
  const needsPortfolio = type === "ALLOCATION_DRIFT" || type === "REVIEW_TIMER";

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

      <Field id="type" label="Alert type" error={fieldErrors?.type?.[0]}>
        <select
          id="type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as AlertType)}
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="PRICE_ABOVE">Price crosses above target</option>
          <option value="PRICE_BELOW">Price falls below target</option>
          <option value="PCT_CHANGE">Percent move from reference</option>
          <option value="REVIEW_TIMER">Periodic review reminder</option>
          <option value="ALLOCATION_DRIFT">Allocation drift</option>
        </select>
      </Field>

      {needsInstrument ? (
        <Field id="yahooSymbol" label="Instrument">
          {lockedYahooSymbol ? (
            <>
              <input
                type="hidden"
                name="yahooSymbol"
                value={lockedYahooSymbol}
              />
              <p className="hairline bg-surface px-3 py-2 text-sm text-muted">
                {lockedSymbolDisplay ?? lockedYahooSymbol}
              </p>
            </>
          ) : (
            <TickerSearch
              name="yahooSymbol"
              defaultYahooSymbol={defaults?.yahooSymbol}
              defaultDisplayLabel={defaults?.symbolDisplay}
            />
          )}
        </Field>
      ) : null}

      {needsPortfolio ? (
        <Field
          id="portfolioId"
          label="Portfolio"
          error={fieldErrors?.portfolioId?.[0]}
        >
          {lockedPortfolioId ? (
            <input type="hidden" name="portfolioId" value={lockedPortfolioId} />
          ) : (
            <select
              id="portfolioId"
              name="portfolioId"
              defaultValue={defaults?.portfolioId ?? ""}
              required={needsPortfolio}
              className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
            >
              <option value="">— Select —</option>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      {type === "PRICE_ABOVE" || type === "PRICE_BELOW" ? (
        <Field
          id="priceTarget"
          label="Price target"
          error={fieldErrors?.priceTarget?.[0]}
        >
          <input
            id="priceTarget"
            name="priceTarget"
            type="number"
            inputMode="decimal"
            step="any"
            required
            defaultValue={defaults?.priceTarget ?? ""}
            className="hairline tabular w-full bg-surface px-3 py-2 text-sm text-foreground"
          />
        </Field>
      ) : null}

      {type === "PCT_CHANGE" ? (
        <Field
          id="pctChange"
          label="Percent threshold"
          hint="Reference price is captured at alert creation time."
          error={fieldErrors?.pctChange?.[0]}
        >
          <input
            id="pctChange"
            name="pctChange"
            type="number"
            inputMode="decimal"
            step="any"
            required
            defaultValue={defaults?.pctChange ?? ""}
            className="hairline tabular w-full bg-surface px-3 py-2 text-sm text-foreground"
          />
        </Field>
      ) : null}

      {type === "REVIEW_TIMER" ? (
        <Field
          id="reviewIntervalDays"
          label="Interval (days)"
          error={fieldErrors?.reviewIntervalDays?.[0]}
        >
          <input
            id="reviewIntervalDays"
            name="reviewIntervalDays"
            type="number"
            min="1"
            step="1"
            required
            defaultValue={defaults?.reviewIntervalDays ?? "30"}
            className="hairline tabular w-full bg-surface px-3 py-2 text-sm text-foreground"
          />
        </Field>
      ) : null}

      {type === "ALLOCATION_DRIFT" ? (
        <Field
          id="allocationThreshold"
          label="Drift threshold (% points)"
          hint="Compares current allocation to the reference at alert creation."
          error={fieldErrors?.allocationThreshold?.[0]}
        >
          <input
            id="allocationThreshold"
            name="allocationThreshold"
            type="number"
            inputMode="decimal"
            step="any"
            required
            defaultValue={defaults?.allocationThreshold ?? ""}
            className="hairline tabular w-full bg-surface px-3 py-2 text-sm text-foreground"
          />
        </Field>
      ) : null}

      <Field id="message" label="Note" error={fieldErrors?.message?.[0]}>
        <input
          id="message"
          name="message"
          type="text"
          maxLength={500}
          defaultValue={defaults?.message ?? ""}
          placeholder="Optional reminder of why this alert exists"
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Create alert"}
        </button>
        <Link
          href={cancelHref}
          className="px-4 py-2 text-sm text-muted hover:text-foreground"
        >
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
