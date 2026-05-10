"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerFlexSync, type ImportActionState } from "@/actions/import";
import { ImportResultDisplay } from "./import-result";

type Portfolio = { id: string; name: string };

type Props = {
  portfolios: Portfolio[];
  defaultPortfolioId?: string | null;
  hasCredentials: boolean;
};

export function FlexSyncSection({
  portfolios,
  defaultPortfolioId,
  hasCredentials,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportActionState | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(
    defaultPortfolioId ?? "",
  );
  const [elapsed, setElapsed] = useState<number | null>(null);

  function handleSync() {
    if (!selectedPortfolioId) {
      setResult({ ok: false, error: "Please select a portfolio." });
      return;
    }
    setResult(null);
    setElapsed(null);
    const start = Date.now();

    startTransition(async () => {
      const res = await triggerFlexSync(selectedPortfolioId);
      setElapsed(Math.round((Date.now() - start) / 1000));
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  if (!hasCredentials) {
    return (
      <p className="text-sm text-muted">
        Configure your IBKR Flex Token and Query ID in{" "}
        <a href="/settings" className="underline">
          Settings
        </a>{" "}
        to enable automated sync.
      </p>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="flex-portfolioId" className="label">
          Portfolio
        </label>
        <select
          id="flex-portfolioId"
          value={selectedPortfolioId}
          onChange={(e) => setSelectedPortfolioId(e.target.value)}
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="">— select a portfolio —</option>
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSync}
          disabled={isPending}
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
