"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ActionState } from "@/actions/portfolios";
import { CurrencySelect } from "@/components/shared/currency-select";

type Props = {
  action: (
    state: ActionState | undefined,
    formData: FormData,
  ) => Promise<ActionState>;
  groups: {
    id: string;
    name: string;
    baseCurrency: string;
  }[];
  defaults?: {
    groupId?: string;
    name?: string;
    description?: string | null;
    baseCurrency?: string;
  };
  submitLabel: string;
  cancelHref: string;
};

export function PortfolioForm({
  action,
  groups,
  defaults,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState<
    ActionState | undefined,
    FormData
  >(action, undefined);

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

      <Field id="name" label="Name" error={fieldErrors?.name?.[0]}>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={100}
          defaultValue={defaults?.name ?? ""}
          placeholder="e.g. Long-term core"
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        />
      </Field>

      <Field
        id="groupId"
        label="Group"
        hint="Choose the allocation bucket this portfolio belongs to."
        error={fieldErrors?.groupId?.[0]}
      >
        <select
          id="groupId"
          name="groupId"
          defaultValue={defaults?.groupId ?? groups[0]?.id ?? ""}
          required
          disabled={groups.length === 0}
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground transition-colors hover:border-border-strong disabled:opacity-50"
        >
          {groups.length === 0 ? (
            <option value="">Create a group first</option>
          ) : null}
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} / {group.baseCurrency}
            </option>
          ))}
        </select>
      </Field>

      <Field
        id="description"
        label="Description"
        hint="Optional. Why this portfolio exists, mandate, constraints."
        error={fieldErrors?.description?.[0]}
      >
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={500}
          defaultValue={defaults?.description ?? ""}
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        />
      </Field>

      <Field
        id="baseCurrency"
        label="Base currency"
        hint="All P&L within this portfolio is reported in this currency."
        error={fieldErrors?.baseCurrency?.[0]}
      >
        <CurrencySelect
          id="baseCurrency"
          name="baseCurrency"
          defaultValue={defaults?.baseCurrency ?? "USD"}
          required
        />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending || groups.length === 0}
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
