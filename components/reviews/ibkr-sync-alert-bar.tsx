import { AlertTriangle, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/db";

const STALE_HOURS = 36;

type Severity = "loss" | "warning" | "info";

export async function IbkrSyncAlertBar() {
  const groups = await db.portfolioGroup.findMany({
    where: {
      ibkrFlexToken: { not: null },
      ibkrFlexQueryId: { not: null },
    },
    select: { id: true },
  });

  if (groups.length === 0) return null;

  const groupIds = groups.map((g) => g.id);

  const latestRuns = await Promise.all(
    groupIds.map((id) =>
      db.ibkrSyncRun.findFirst({
        where: { groupId: id },
        orderBy: { startedAt: "desc" },
      }),
    ),
  );

  const now = Date.now();
  let failingGroups = 0;
  let unresolvedSymbols = 0;
  let staleGroups = 0;
  let neverRun = 0;

  for (const run of latestRuns) {
    if (!run) {
      neverRun += 1;
      continue;
    }
    if (!run.ok) {
      failingGroups += 1;
      continue;
    }
    const failed = Array.isArray(run.failedSymbols)
      ? run.failedSymbols.length
      : 0;
    if (failed > 0) {
      unresolvedSymbols += failed;
      continue;
    }
    if (run.startedAt.getTime() < now - STALE_HOURS * 60 * 60 * 1000) {
      staleGroups += 1;
    }
  }

  let severity: Severity | null = null;
  let message = "";
  let Icon = AlertTriangle;

  if (failingGroups > 0) {
    severity = "loss";
    Icon = XCircle;
    message = `${failingGroups} IBKR ${failingGroups === 1 ? "group is" : "groups are"} failing — last run errored.`;
  } else if (unresolvedSymbols > 0) {
    severity = "warning";
    Icon = AlertTriangle;
    message = `${unresolvedSymbols} unresolved ${unresolvedSymbols === 1 ? "symbol" : "symbols"} across IBKR groups.`;
  } else if (staleGroups > 0 || neverRun > 0) {
    severity = "info";
    Icon = Clock;
    if (neverRun > 0 && staleGroups === 0) {
      message = `${neverRun} IBKR ${neverRun === 1 ? "group has" : "groups have"} never been synced.`;
    } else {
      const parts: string[] = [];
      if (staleGroups > 0)
        parts.push(`${staleGroups} stale (>${STALE_HOURS}h)`);
      if (neverRun > 0) parts.push(`${neverRun} never run`);
      message = `IBKR sync needs attention — ${parts.join(", ")}.`;
    }
  }

  if (!severity) return null;

  const TONE: Record<Severity, string> = {
    loss: "border-loss/40 bg-loss-soft text-loss",
    warning: "border-warning/40 bg-warning/10 text-warning",
    info: "border-info/40 bg-info/10 text-info",
  };

  return (
    <Link
      href="/reviews/ibkr"
      className={`hairline group mb-6 flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors ${TONE[severity]}`}
    >
      <span className="flex items-center gap-2.5">
        <span className="relative inline-flex items-center justify-center">
          {severity === "loss" ? (
            <span
              aria-hidden
              className="absolute inline-flex h-4 w-4 animate-ping rounded-full bg-loss/40"
            />
          ) : null}
          <Icon className="relative h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <span>{message}</span>
      </span>
      <span className="label inline-flex items-center gap-1 underline-offset-2 group-hover:underline">
        Open IBKR sync →
      </span>
    </Link>
  );
}
