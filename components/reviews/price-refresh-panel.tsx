import type { PriceRefreshRun } from "@/app/generated/prisma/client";
import { formatDateTime, formatRelative } from "@/lib/format";
import { RefreshPricesButton } from "./refresh-prices-button";

type Failure = { yahooSymbol: string; error: string };

type Severity = "ok" | "warning" | "loss" | "info" | "muted" | "running";

type Status = {
  severity: Severity;
  label: string;
};

const RUNNING_WINDOW_MS = 30 * 60 * 1000;

function readFailures(run: PriceRefreshRun): Failure[] {
  const raw = run.failures;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (
      entry &&
      typeof entry === "object" &&
      "yahooSymbol" in entry &&
      "error" in entry &&
      typeof (entry as Record<string, unknown>).yahooSymbol === "string" &&
      typeof (entry as Record<string, unknown>).error === "string"
    ) {
      return [entry as Failure];
    }
    return [];
  });
}

function isInflight(run: PriceRefreshRun): boolean {
  if (run.finishedAt) return false;
  return Date.now() - run.startedAt.getTime() < RUNNING_WINDOW_MS;
}

function isInterrupted(run: PriceRefreshRun): boolean {
  return !run.finishedAt && !isInflight(run);
}

function deriveStatus(
  latest: PriceRefreshRun | null,
  staleHours: number,
): Status {
  if (!latest) return { severity: "muted", label: "Never run" };
  if (isInflight(latest)) return { severity: "running", label: "Running…" };
  if (isInterrupted(latest)) return { severity: "loss", label: "Interrupted" };
  if (!latest.ok) return { severity: "loss", label: "Failing" };
  const failures = readFailures(latest);
  if (failures.length > 0) {
    return {
      severity: "warning",
      label: `${failures.length} unresolved`,
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
  running: "border-info/40 bg-info/10 text-info",
  muted: "border-border bg-surface text-muted",
};

const DOT_CLASS: Record<Severity, string> = {
  ok: "bg-gain",
  warning: "bg-warning",
  loss: "bg-loss",
  info: "bg-info",
  running: "bg-info animate-pulse",
  muted: "bg-border-strong",
};

function dotSeverity(run: PriceRefreshRun): Severity {
  if (isInflight(run)) return "running";
  if (isInterrupted(run)) return "loss";
  if (!run.ok) return "loss";
  if (readFailures(run).length > 0) return "warning";
  return "ok";
}

export function PriceRefreshPanel({
  runs,
  staleHours,
}: {
  runs: PriceRefreshRun[];
  staleHours: number;
}) {
  const latest = runs[0] ?? null;
  const status = deriveStatus(latest, staleHours);
  const failures = latest ? readFailures(latest) : [];
  const running = latest ? isInflight(latest) : false;

  return (
    <article className="hairline bg-surface-elevated">
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <h2 className="display text-xl text-foreground">Price refresh</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {latest ? (
              <>
                <span>
                  {running
                    ? `Started ${formatRelative(latest.startedAt)}`
                    : `Last refreshed ${formatRelative(latest.startedAt)}`}
                </span>
                {!running ? (
                  <>
                    <span aria-hidden className="text-border-strong">
                      ·
                    </span>
                    <RunStats run={latest} />
                  </>
                ) : null}
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
              <span>
                Daily Yahoo Finance EOD pull across every instrument — no runs
                recorded yet.
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <RefreshPricesButton isRunning={running} />
        </div>
      </header>

      {latest?.error ? (
        <div className="mx-5 mt-4 hairline border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss">
          <p className="label">Refresh error</p>
          <p className="mt-1 font-mono text-xs leading-relaxed">
            {latest.error}
          </p>
        </div>
      ) : null}

      {failures.length > 0 ? (
        <div className="mt-5 border-t border-border px-5 pt-4">
          <p className="label text-warning">Unresolved symbols</p>
          <ul className="mt-3 flex flex-col gap-2">
            {failures.map((f) => (
              <li
                key={`${f.yahooSymbol}-${f.error}`}
                className="flex items-baseline gap-3 text-sm"
              >
                <span className="font-mono text-xs uppercase tracking-wider text-warning">
                  {f.yahooSymbol}
                </span>
                <span className="text-muted">{f.error}</span>
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

function RunStats({ run }: { run: PriceRefreshRun }) {
  if (!run.finishedAt) {
    return <span className="text-muted">In progress</span>;
  }
  if (!run.ok) {
    return <span className="text-loss">Run errored</span>;
  }
  const instrumentLabel = run.instruments === 1 ? "instrument" : "instruments";
  const barLabel = run.bars === 1 ? "bar" : "bars";
  return (
    <span>
      {run.instruments} {instrumentLabel} · {run.bars} new {barLabel}
    </span>
  );
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

function TrendStrip({ runs }: { runs: PriceRefreshRun[] }) {
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
        const failureCount = readFailures(r).length;
        const tip = [
          formatDateTime(r.startedAt),
          isInflight(r)
            ? "In progress"
            : isInterrupted(r)
              ? "Interrupted"
              : r.ok
                ? `${r.instruments} instruments, ${r.bars} bars`
                : "Run errored",
          failureCount > 0 ? `${failureCount} unresolved` : null,
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
