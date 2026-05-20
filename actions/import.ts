"use server";

import { revalidatePath } from "next/cache";
import type { ImportResult } from "@/lib/import/ibkr-engine";
import { runIbkrSyncForGroup } from "@/lib/import/ibkr-sync";

export type ImportActionState =
  | ({ ok: true } & ImportResult)
  | { ok: false; error: string };

export async function triggerFlexSync(
  groupId: string,
): Promise<ImportActionState> {
  const outcome = await runIbkrSyncForGroup(groupId, "manual");

  if (!outcome.ok) {
    return { ok: false, error: outcome.error };
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/reviews/ibkr");
  revalidatePath("/reviews");
  return {
    ok: true,
    inserted: outcome.inserted,
    skipped: outcome.skipped,
    cashInserted: outcome.cashInserted,
    cashSkipped: outcome.cashSkipped,
    failed: outcome.failed,
  };
}
