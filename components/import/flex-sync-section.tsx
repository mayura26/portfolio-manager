"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type ImportActionState, triggerFlexSync } from "@/actions/import";
import { ImportResultDisplay } from "./import-result";

type Group = { id: string; name: string; hasCredentials: boolean };

type Props = {
  groups: Group[];
};

export function FlexSyncSection({ groups }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportActionState | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState(
    groups.find((g) => g.hasCredentials)?.id ?? "",
  );
  const [elapsed, setElapsed] = useState<number | null>(null);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  function handleSync() {
    if (!selectedGroupId) {
      setResult({ ok: false, error: "Please select a group." });
      return;
    }
    setResult(null);
    setElapsed(null);
    const start = Date.now();

    startTransition(async () => {
      const res = await triggerFlexSync(selectedGroupId);
      setElapsed(Math.round((Date.now() - start) / 1000));
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted">
        No portfolio groups exist yet.{" "}
        <a href="/groups/new" className="underline">
          Create one
        </a>{" "}
        first.
      </p>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="flex-groupId" className="label">
          Portfolio group
        </label>
        <select
          id="flex-groupId"
          value={selectedGroupId}
          onChange={(e) => {
            setSelectedGroupId(e.target.value);
            setResult(null);
          }}
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="">— select a group —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
              {g.hasCredentials ? "" : " (no IBKR credentials)"}
            </option>
          ))}
        </select>
        {selectedGroup && !selectedGroup.hasCredentials ? (
          <p className="text-xs text-loss">
            This group has no IBKR credentials.{" "}
            <a
              href={`/groups/${selectedGroup.id}/settings`}
              className="underline"
            >
              Configure them in group settings.
            </a>
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSync}
          disabled={
            isPending ||
            !selectedGroupId ||
            (selectedGroup ? !selectedGroup.hasCredentials : false)
          }
          className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending ? "Fetching from IBKR…" : "Sync from IBKR"}
        </button>
        {isPending ? (
          <span className="text-xs text-subtle">
            This may take up to 30 seconds…
          </span>
        ) : null}
        {elapsed !== null && !isPending ? (
          <span className="text-xs text-subtle">Completed in {elapsed}s</span>
        ) : null}
      </div>

      {result ? (
        result.ok ? (
          <ImportResultDisplay result={result} />
        ) : (
          <div
            className="hairline border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss"
            role="alert"
          >
            {result.error}
          </div>
        )
      ) : null}
    </div>
  );
}
