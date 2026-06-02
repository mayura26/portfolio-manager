import type { CronJobRun } from "@/app/generated/prisma/client";
import { formatDateTime, formatRelative } from "@/lib/format";

type Severity = "ok" | "warning" | "loss" | "info" | "muted" | "running";

export type CronJobConfig = {
  job: string;
  label: string;
  command: string;
  cadence: string;
  staleHours: number;
};

export type CronJobStatus = {
  config: CronJobConfig;
  runs: CronJobRun[];
};

type Status = {
  severity: Severity;
  label: string;
};

const RUNNING_WINDOW_MS = 30 * 60 * 1000;

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

function isInflight(run: CronJobRun): boolean {
  if (run.finishedAt) return false;
  return Date.now() - run.startedAt.getTime() < RUNNING_WINDOW_MS;
}

function isInterrupted(run: CronJobRun): boolean {
  return !run.finishedAt && !isInflight(run);
}

function deriveStatus(config: CronJobConfig, latest: CronJobRun | null): Status {
  if (!latest) return { severity: "muted", label: "Never run" };
  if (isInflight(latest)) return { severity: "running", label: "Running" };
  if (isInterrupted(latest)) return { severity: "loss", label: "Interrupted" };
  if (!latest.ok) return { severity: "loss", label: "Failing" };
  if (latest.warnings > 0) {
    return {
      severity: "warning",
      label: `${latest.warnings} warning${latest.warnings === 1 ? "" : "s"}`,
    };
  }
  const ageMs = Date.now() - latest.startedAt.getTime();
  if (ageMs > config.staleHours * 60 * 60 * 1000) {
    return { severity: "info", label: "Stale" };
  }
  return { severity: "ok", label: "Healthy" };
}

function runSeverity(run: CronJobRun): Severity {
  if (isInflight(run)) return "running";
  if (isInterrupted(run)) return "loss";
  if (!run.ok) return "loss";
  if (run.warnings > 0) return "warning";
  return "ok";
}

function summaryText(run: CronJobRun): string {
  if (run.error) return run.error;
  if (!run.summary || typeof run.summary !== "object") {
    return run.warnings > 0 ? "Completed with warnings" : "Completed";
  }

  const summary = run.summary as Record<string, unknown>;
  const parts = Object.entries(summary).flatMap(([key, value]) => {
    if (typeof value === "boolean") return [`${key}: ${value ? "yes" : "no"}`];
    if (typeof value === "number" || typeof value === "string") {
      return [`${key}: ${value}`];
    }
    return [];
  });

  return parts.slice(0, 4).join(" · ") || "Completed";
}

export function CronStatusPanel({ jobs }: { jobs: CronJobStatus[] }) {
  const totals = jobs.reduce(
    (acc, job) => {
      const status = deriveStatus(job.config, job.runs[0] ?? null);
      acc[status.severity] += 1;
      return acc;
    },
    { ok: 0, warning: 0, loss: 0, info: 0, muted: 0, running: 0 },
  );

  return (
    <section className="hairline bg-surface-elevated">
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
        <div>
          <h2 className="display text-xl text-foreground">Scheduled jobs</h2>
          <p className="mt-1 text-xs text-muted">
            Last recorded Coolify cron runs across sync, alerts, AI, and weekly
            reporting.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden border border-border bg-border text-center sm:grid-cols-6">
          <MiniStat label="healthy" value={totals.ok} tone="ok" />
          <MiniStat label="warn" value={totals.warning} tone="warning" />
          <MiniStat label="fail" value={totals.loss} tone="loss" />
          <MiniStat label="stale" value={totals.info} tone="info" />
          <MiniStat label="running" value={totals.running} tone="running" />
          <MiniStat label="unrun" value={totals.muted} tone="muted" />
        </div>
      </header>

      <div className="mt-5 overflow-x-auto border-t border-border">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-xs text-subtle">
            <tr>
              <th className="px-5 py-3 font-medium">Job</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Latest</th>
              <th className="px-5 py-3 font-medium">Summary</th>
              <th className="px-5 py-3 font-medium">History</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(({ config, runs }) => {
              const latest = runs[0] ?? null;
              const status = deriveStatus(config, latest);
              return (
                <tr key={config.job} className="border-b border-border/70">
                  <td className="px-5 py-4 align-top">
                    <p className="text-sm text-foreground">{config.label}</p>
                    <p className="mt-1 font-mono text-xs text-subtle">
                      {config.command}
                    </p>
                    <p className="mt-1 text-xs text-muted">{config.cadence}</p>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-5 py-4 align-top text-xs text-muted">
                    {latest ? (
                      <>
                        <p>{formatRelative(latest.startedAt)}</p>
                        {latest.finishedAt ? (
                          <p className="mt-1 text-subtle">
                            Done {formatDateTime(latest.finishedAt)}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      "No run recorded"
                    )}
                  </td>
                  <td className="max-w-sm px-5 py-4 align-top text-xs text-muted">
                    {latest ? summaryText(latest) : "Will populate after the next deployed cron run."}
                  </td>
                  <td className="px-5 py-4 align-top">
                    <TrendStrip runs={runs} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: Severity;
}) {
  const toneClass = {
    ok: "text-gain",
    warning: "text-warning",
    loss: "text-loss",
    info: "text-info",
    running: "text-info",
    muted: "text-muted",
  }[tone];
  return (
    <div className="bg-surface px-3 py-2">
      <p className={`tabular text-base ${toneClass}`}>{value}</p>
      <p className="label text-[10px]">{label}</p>
    </div>
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

function TrendStrip({ runs }: { runs: CronJobRun[] }) {
  if (runs.length === 0) {
    return <p className="text-xs text-subtle italic">No history yet.</p>;
  }

  return (
    <div className="flex items-center gap-1.5" role="img" aria-label="Recent cron runs">
      {[...runs].reverse().map((run) => {
        const sev = runSeverity(run);
        const tip = [
          formatDateTime(run.startedAt),
          run.ok ? "Completed" : "Failed",
          run.warnings > 0 ? `${run.warnings} warnings` : null,
          run.error,
        ]
          .filter(Boolean)
          .join(" - ");
        return (
          <span
            key={run.id}
            title={tip}
            className={`inline-block h-2 w-2 rounded-full transition-transform hover:scale-150 ${DOT_CLASS[sev]}`}
          />
        );
      })}
    </div>
  );
}
