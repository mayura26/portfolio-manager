"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { executePriceRefreshIntoRun } from "@/lib/price-refresh";

export type TriggerPriceRefreshResult =
  | { ok: true; runId: string }
  | { ok: false; error: string };

const INFLIGHT_WINDOW_MS = 30 * 60 * 1000;

export async function triggerPriceRefresh(): Promise<TriggerPriceRefreshResult> {
  // Bail if another run is genuinely in-flight (started within the last
  // 30 minutes and not yet finished). Older unfinished rows are treated
  // as crashed and don't block a new attempt.
  const inflight = await db.priceRefreshRun.findFirst({
    where: {
      finishedAt: null,
      startedAt: { gte: new Date(Date.now() - INFLIGHT_WINDOW_MS) },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (inflight) {
    return { ok: false, error: "A refresh is already running." };
  }

  const run = await db.priceRefreshRun.create({
    data: { trigger: "manual", ok: false },
    select: { id: true },
  });

  // Fire-and-forget: run the refresh after the response is sent.
  after(async () => {
    await executePriceRefreshIntoRun(run.id);
  });

  revalidatePath("/reviews/ibkr");
  return { ok: true, runId: run.id };
}
