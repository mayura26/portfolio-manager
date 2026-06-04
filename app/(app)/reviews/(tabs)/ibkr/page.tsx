import { CableIcon, KeyRound } from "lucide-react";
import { Suspense } from "react";
import {
  type CronJobConfig,
  CronStatusPanel,
} from "@/components/reviews/cron-status-panel";
import { IbkrSyncPanel } from "@/components/reviews/ibkr-sync-panel";
import { PriceRefreshPanel } from "@/components/reviews/price-refresh-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";

const TREND_RUNS = 10;
const STALE_HOURS = 36;
const PRICE_STALE_HOURS = 36;
const CRON_JOBS: CronJobConfig[] = [
  {
    job: "prices",
    label: "Price refresh",
    command: "npm run cron:prices",
    cadence: "Daily",
    staleHours: 36,
  },
  {
    job: "fx-rates",
    label: "FX rates",
    command: "npm run cron:fx-rates",
    cadence: "Daily",
    staleHours: 36,
  },
  {
    job: "alerts",
    label: "Alerts",
    command: "npm run cron:alerts",
    cadence: "Daily or more often",
    staleHours: 36,
  },
  {
    job: "ibkr-sync",
    label: "IBKR sync",
    command: "npm run cron:ibkr-sync",
    cadence: "Daily",
    staleHours: 36,
  },
  {
    job: "autowatcher",
    label: "AutoWatcher",
    command: "npm run cron:autowatcher",
    cadence: "Daily",
    staleHours: 36,
  },
  {
    job: "forecasts",
    label: "Forecast refresh",
    command: "npm run cron:forecasts",
    cadence: "Weekly",
    staleHours: 8 * 24,
  },
  {
    job: "weekly-report",
    label: "Weekly report",
    command: "npm run cron:weekly-report",
    cadence: "Weekly",
    staleHours: 8 * 24,
  },
  {
    job: "trades",
    label: "Trades (Congress · Senate · Insider · Executive)",
    command: "npm run cron:trades",
    cadence: "Daily",
    staleHours: 36,
  },
];

export default function IbkrSyncPage() {
  return (
    <div>
      <div className="mb-6">
        <p className="label">Data sync</p>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Status of the Coolify scheduled jobs — global Yahoo Finance price
          refresh and per-group IBKR Flex statement sync. Trigger either
          manually to pull the latest data on demand.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <IbkrSyncContent />
      </Suspense>
    </div>
  );
}

async function IbkrSyncContent() {
  const [groups, priceRuns, cronRuns] = await Promise.all([
    db.portfolioGroup.findMany({
      where: {
        ibkrFlexToken: { not: null },
        ibkrFlexQueryId: { not: null },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.priceRefreshRun.findMany({
      orderBy: { startedAt: "desc" },
      take: TREND_RUNS,
    }),
    db.cronJobRun.findMany({
      where: { job: { in: CRON_JOBS.map((job) => job.job) } },
      orderBy: { startedAt: "desc" },
      take: TREND_RUNS * CRON_JOBS.length,
    }),
  ]);

  const cronRunsByJob = new Map<string, typeof cronRuns>();
  for (const job of CRON_JOBS) cronRunsByJob.set(job.job, []);
  for (const run of cronRuns) {
    const bucket = cronRunsByJob.get(run.job);
    if (bucket && bucket.length < TREND_RUNS) bucket.push(run);
  }

  const cronSection = (
    <CronStatusPanel
      jobs={CRON_JOBS.map((config) => ({
        config,
        runs: cronRunsByJob.get(config.job) ?? [],
      }))}
    />
  );

  const priceSection = (
    <PriceRefreshPanel runs={priceRuns} staleHours={PRICE_STALE_HOURS} />
  );

  if (groups.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {cronSection}
        {priceSection}
        <EmptyState
          icon={KeyRound}
          title="No groups are wired to IBKR"
          description="Add a Flex Query Token and Query ID to a portfolio group's settings to begin syncing trades from Interactive Brokers."
        />
      </div>
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
      {cronSection}
      {priceSection}
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
        Scheduled tasks write one row to{" "}
        <code className="font-mono">CronJobRun</code> per command. Price and
        IBKR jobs also keep detailed run tables for drill-down.
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
