import { CableIcon, KeyRound } from "lucide-react";
import { Suspense } from "react";
import { IbkrSyncPanel } from "@/components/reviews/ibkr-sync-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";

const TREND_RUNS = 10;
const STALE_HOURS = 36;

export default function IbkrSyncPage() {
  return (
    <div>
      <div className="mb-6">
        <p className="label">IBKR sync</p>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Status of the Coolify scheduled Flex statement sync, per group.
          Manually retry a sync after fixing credentials or to pull the latest
          trades on demand.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <IbkrSyncContent />
      </Suspense>
    </div>
  );
}

async function IbkrSyncContent() {
  const groups = await db.portfolioGroup.findMany({
    where: {
      ibkrFlexToken: { not: null },
      ibkrFlexQueryId: { not: null },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={KeyRound}
        title="No groups are wired to IBKR"
        description="Add a Flex Query Token and Query ID to a portfolio group's settings to begin syncing trades from Interactive Brokers."
      />
    );
  }

  const groupIds = groups.map((g) => g.id);

  const runs = await db.ibkrSyncRun.findMany({
    where: { groupId: { in: groupIds } },
    orderBy: { startedAt: "desc" },
    take: TREND_RUNS * groupIds.length,
  });

  const runsByGroup = new Map<string, typeof runs>();
  for (const id of groupIds) runsByGroup.set(id, []);
  for (const run of runs) {
    const bucket = runsByGroup.get(run.groupId);
    if (bucket && bucket.length < TREND_RUNS) bucket.push(run);
  }

  const now = Date.now();
  const summary = groups.reduce(
    (acc, g) => {
      const latest = runsByGroup.get(g.id)?.[0];
      if (!latest) {
        acc.neverRun += 1;
        return acc;
      }
      const failed = Array.isArray(latest.failedSymbols)
        ? latest.failedSymbols.length
        : 0;
      const stale =
        latest.startedAt.getTime() < now - STALE_HOURS * 60 * 60 * 1000;
      if (!latest.ok) acc.failing += 1;
      else if (failed > 0) acc.unresolved += failed;
      else if (stale) acc.stale += 1;
      else acc.ok += 1;
      return acc;
    },
    { ok: 0, failing: 0, unresolved: 0, stale: 0, neverRun: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="hairline grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-4">
        <SummaryCell
          value={summary.ok}
          label="healthy"
          tone={summary.ok > 0 ? "gain" : "muted"}
        />
        <SummaryCell
          value={summary.unresolved}
          label={
            summary.unresolved === 1
              ? "unresolved symbol"
              : "unresolved symbols"
          }
          tone={summary.unresolved > 0 ? "warning" : "muted"}
        />
        <SummaryCell
          value={summary.failing}
          label={summary.failing === 1 ? "failing group" : "failing groups"}
          tone={summary.failing > 0 ? "loss" : "muted"}
        />
        <SummaryCell
          value={summary.stale + summary.neverRun}
          label={
            summary.neverRun > 0 && summary.stale === 0
              ? "never run"
              : "stale or unrun"
          }
          tone={summary.stale + summary.neverRun > 0 ? "info" : "muted"}
        />
      </div>

      <ul className="flex flex-col gap-4">
        {groups.map((g) => (
          <li key={g.id}>
            <IbkrSyncPanel
              group={g}
              runs={runsByGroup.get(g.id) ?? []}
              staleHours={STALE_HOURS}
            />
          </li>
        ))}
      </ul>

      <p className="flex items-center gap-2 text-xs text-subtle">
        <CableIcon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
        Scheduled task:{" "}
        <code className="font-mono">npm run cron:ibkr-sync</code> runs on
        Coolify and writes one row to{" "}
        <code className="font-mono">IbkrSyncRun</code> per group.
      </p>
    </div>
  );
}

function SummaryCell({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "gain" | "warning" | "loss" | "info" | "muted";
}) {
  const toneClass = {
    gain: "text-gain",
    warning: "text-warning",
    loss: "text-loss",
    info: "text-info",
    muted: "text-muted",
  }[tone];
  return (
    <div className="bg-surface px-5 py-4">
      <p className={`display text-3xl tabular ${toneClass}`}>{value}</p>
      <p className="label mt-0.5">{label}</p>
    </div>
  );
}
