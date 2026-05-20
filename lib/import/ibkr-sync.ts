import type { IbkrSyncRun } from "@/app/generated/prisma/client";
import { db } from "@/lib/db";
import { importToGroup } from "./ibkr-engine";
import { fetchFlexStatement } from "./ibkr-flex";

export type SyncTrigger = "cron" | "manual";

export type RunIbkrSyncOutcome =
  | {
      ok: true;
      run: IbkrSyncRun;
      inserted: number;
      skipped: number;
      cashInserted: number;
      cashSkipped: number;
      failed: { symbol: string; reason: string }[];
    }
  | { ok: false; run: IbkrSyncRun | null; error: string };

/**
 * Run a single IBKR Flex sync for one group: fetch the statement, import
 * trades + cash, persist the outcome as an IbkrSyncRun row. Used by the
 * Coolify cron (`scripts/cron-ibkr-sync.ts`) and the "Sync now" button so
 * both writers produce identical history records.
 */
export async function runIbkrSyncForGroup(
  groupId: string,
  trigger: SyncTrigger = "cron",
): Promise<RunIbkrSyncOutcome> {
  const group = await db.portfolioGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      ibkrFlexToken: true,
      ibkrFlexQueryId: true,
    },
  });

  if (!group) {
    return { ok: false, run: null, error: "Portfolio group not found" };
  }
  if (!group.ibkrFlexToken || !group.ibkrFlexQueryId) {
    return {
      ok: false,
      run: null,
      error: "IBKR Flex Token and Query ID must be configured on this group",
    };
  }

  const run = await db.ibkrSyncRun.create({
    data: { groupId, ok: false, trigger },
  });

  try {
    const statement = await fetchFlexStatement(
      group.ibkrFlexToken,
      group.ibkrFlexQueryId,
    );
    const result = await importToGroup(
      statement.trades,
      groupId,
      statement.cashTxs,
    );

    const updated = await db.ibkrSyncRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        ok: true,
        inserted: result.inserted,
        skipped: result.skipped,
        cashInserted: result.cashInserted,
        cashSkipped: result.cashSkipped,
        failedSymbols: result.failed,
      },
    });

    return { ok: true, run: updated, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const updated = await db.ibkrSyncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: false, error: message },
    });
    return { ok: false, run: updated, error: message };
  }
}
