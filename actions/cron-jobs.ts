"use server";

import { spawn } from "node:child_process";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

const RUNNING_WINDOW_MS = 30 * 60 * 1000;

const CRON_SCRIPTS = {
  prices: "cron:prices",
  "fx-rates": "cron:fx-rates",
  alerts: "cron:alerts",
  forecasts: "cron:forecasts",
  "ibkr-sync": "cron:ibkr-sync",
  autowatcher: "cron:autowatcher",
  "weekly-report": "cron:weekly-report",
  "congress-trades": "cron:congress-trades",
} as const;

export type ManualCronJob = keyof typeof CRON_SCRIPTS;

export type RunCronJobResult =
  | { ok: true; job: ManualCronJob }
  | { ok: false; error: string };

function isManualCronJob(job: string): job is ManualCronJob {
  return job in CRON_SCRIPTS;
}

export async function runCronJob(job: string): Promise<RunCronJobResult> {
  if (!isManualCronJob(job)) {
    return { ok: false, error: "Unknown cron job" };
  }

  const latest = await db.cronJobRun.findFirst({
    where: { job },
    orderBy: { startedAt: "desc" },
  });

  if (
    latest &&
    !latest.finishedAt &&
    Date.now() - latest.startedAt.getTime() < RUNNING_WINDOW_MS
  ) {
    return { ok: false, error: "This job is already running" };
  }

  try {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npm, ["run", CRON_SCRIPTS[job]], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not start cron job",
    };
  }

  revalidatePath("/reviews/ibkr");
  return { ok: true, job };
}

