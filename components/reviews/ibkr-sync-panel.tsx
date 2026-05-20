import type { IbkrSyncRun } from "@/app/generated/prisma/client";
import { formatDateTime, formatRelative } from "@/lib/format";
import { SyncNowButton } from "./sync-now-button";

type FailedSymbol = { symbol: string; reason: string };

type GroupRef = { id: string; name: string };

type Severity = "ok" | "warning" | "loss" | "info" | "muted";

type Status = {
  severity: Severity;
  label: string;
};

function readFailedSymbols(run: IbkrSyncRun): FailedSymbol[] {
  const raw = run.failedSymbols;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (
      entry &&
      typeof entry === "object" &&
      "symbol" in entry &&
      "reason" in entry &&
      typeof (entry as Record<string, unknown>).symbol === "string" &&
      typeof (entry as Record<string, unknown>).reason === "string"
    ) {
      return [entry as FailedSymbol];
    }
    return [];
  });
}

function deriveStatus(latest: IbkrSyncRun | null, staleHours: number): Status {
  if (!latest) return { severity: "muted", label: "Never run" };
  if (!latest.ok) return { severity: "loss", label: "Failing" };
  const failed = readFailedSymbols(latest);
  if (failed.length > 0) {
    return {
      severity: "warning",
      label: `${failed.length} unresolved`,
    };
  }
  const ageMs = Date.now() - latest.startedAt.getTime();
  if (ageMs > staleHours * 60 * 60 * 1000) {
    return { severity: "info", label: "Stale" };
  }
  return { severity: "ok", label: "Healthy" };
}

const BADGE_CLASS: Record<Severity, string> = {
  ok: "border-gain/40 bg-gain-soft text-gain",
  warning: "border-warning/40 bg-warning/10 text-warning",
  loss: "border-loss/40 bg-loss-soft text-loss",
  info: "border-info/40 bg-info/10 text-info",
  muted: "border-border bg-surface text-muted",
};

const DOT_CLASS: Record<Severity, string> = {
  ok: "bg-gain",
  warning: "bg-warning",
  loss: "bg-loss",
  info: "bg-info",
  muted: "bg-border-strong",
};

function dotSeverity(run: IbkrSyncRun): Severity {
  if (!run.ok) return "loss";
  if (readFailedSymbols(run).length > 0) return "warning";
  return "ok";
}

export function IbkrSyncPanel({
  group,
  runs,
  staleHours,
}: {
  group: GroupRef;
  runs: IbkrSyncRun[];
  staleHours: number;
}) {
  const latest = runs[0] ?? null;
  const status = deriveStatus(latest, staleHours);
  const failed = latest ? readFailedSymbols(latest) : [];

  return (
    <article className="hairline bg-surface-elevated">
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <h2 className="display text-xl text-foreground">{group.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {latest ? (
              <>
                <span>Last synced {formatRelative(latest.startedAt)}</span>
                <span aria-hidden className="text-border-strong">
                  ·
                </span>
                <RunStats run={latest} />
                {latest.trigger === "manual" ? (
                  <>
                    <span aria-hidden className="text-border-strong">
                      ·
                    </span>
                    <span>Manual trigger</span>
                  </>
                ) : null}
              </>
            ) : (
              <span>No syncs recorded yet for this group</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <SyncNowButton groupId={group.id} />
        </div>
      </header>

      {latest?.error ? (
        <div className="mx-5 mt-4 hairline border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss">
          <p className="label">Sync error</p>
          <p className="mt-1 font-mono text-xs leading-relaxed">
            {latest.error}
          </p>
        </div>
      ) : null}

      {failed.length > 0 ? (
        <div className="mt-5 border-t border-border px-5 pt-4">
          <p className="label text-warning">Unresolved symbols</p>
          <ul className="mt-3 flex flex-col gap-2">
            {failed.map((f) => (
              <li
                key={`${f.symbol}-${f.reason}`}
                className="flex items-baseline gap-3 text-sm"
              >
                <span className="font-mono text-xs uppercase tracking-wider text-warning">
                  {f.symbol}
                </span>
                <span className="text-muted">{f.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-4">
        <div>
          <p className="label">Recent runs</p>
          <TrendStrip runs={runs} />
        </div>
        {latest?.finishedAt ? (
          <p className="text-xs text-subtle tabular">
            Last completed {formatDateTime(latest.finishedAt)}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function RunStats({ run }: { run: IbkrSyncRun }) {
  if (!run.ok) {
    return <span className="text-loss">Run errored</span>;
  }
  const parts: string[] = [];
  if (run.inserted > 0)
    parts.push(`${run.inserted} ${run.inserted === 1 ? "trade" : "trades"}`);
  if (run.cashInserted > 0)
    parts.push(
      `${run.cashInserted} ${run.cashInserted === 1 ? "cash txn" : "cash txns"}`,
    );
  if (parts.length === 0) parts.push("nothing new");
  return <span>{parts.join(" · ")}</span>;
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`label inline-flex items-center gap-1.5 border px-2 py-0.5 ${BADGE_CLASS[status.severity]}`}
    >
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${DOT_CLASS[status.severity]}`}
      />
      {status.label}
    </span>
  );
}

function TrendStrip({ runs }: { runs: IbkrSyncRun[] }) {
  if (runs.length === 0) {
    return (
      <p className="mt-2 text-xs text-subtle italic">No history to show yet.</p>
    );
  }
  const dots = [...runs].reverse();
  return (
    <div
      className="mt-2 flex items-center gap-1.5"
      role="img"
      aria-label="Last 10 runs"
    >
      {dots.map((r) => {
        const sev = dotSeverity(r);
        const failedCount = readFailedSymbols(r).length;
        const tip = [
          formatDateTime(r.startedAt),
          r.ok ? `${r.inserted} trades, ${r.cashInserted} cash` : "Run errored",
          failedCount > 0 ? `${failedCount} unresolved` : null,
        ]
          .filter(Boolean)
          .join(" — ");
        return (
          <span
            key={r.id}
            title={tip}
            className={`inline-block h-2 w-2 rounded-full transition-transform hover:scale-150 ${DOT_CLASS[sev]}`}
          />
        );
      })}
    </div>
  );
}
