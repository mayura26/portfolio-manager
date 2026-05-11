"use client";

import { useActionState } from "react";
import { updateGroupIbkr, type GroupActionState } from "@/actions/groups";

type Props = {
  groupId: string;
  defaults: {
    ibkrFlexToken: string | null;
    ibkrFlexQueryId: string | null;
  };
};

export function IbkrGroupForm({ groupId, defaults }: Props) {
  const action = updateGroupIbkr.bind(null, groupId);
  const [state, formAction, pending] = useActionState<
    GroupActionState | undefined,
    FormData
  >(action, undefined);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      {state && !state.ok ? (
        <div
          className="hairline border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

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
          Create a Flex Query in IBKR for Trades with XML format and copy the
          Query ID here.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save IBKR settings"}
        </button>
        {state?.ok ? <span className="text-sm text-gain">Saved</span> : null}
      </div>
    </form>
  );
}
