"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { ParsedStatement } from "@/lib/import/ibkr-csv";
import { type ImportResult, importToGroup } from "@/lib/import/ibkr-engine";
import { fetchFlexStatement } from "@/lib/import/ibkr-flex";

export type ImportActionState =
  | ({ ok: true } & ImportResult)
  | { ok: false; error: string };

export async function triggerFlexSync(
  groupId: string,
): Promise<ImportActionState> {
  const group = await db.portfolioGroup.findUnique({
    where: { id: groupId },
    select: { ibkrFlexToken: true, ibkrFlexQueryId: true },
  });

  if (!group) return { ok: false, error: "Portfolio group not found." };

  if (!group.ibkrFlexToken || !group.ibkrFlexQueryId) {
    return {
      ok: false,
      error:
        "IBKR Flex Token and Query ID must be configured on this group before syncing.",
    };
  }

  let statement: ParsedStatement;
  try {
    statement = await fetchFlexStatement(
      group.ibkrFlexToken,
      group.ibkrFlexQueryId,
    );
  } catch (err) {
    return {
      ok: false,
      error: `IBKR connection failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  try {
    const result = await importToGroup(
      statement.trades,
      groupId,
      statement.cashTxs,
    );
    revalidatePath(`/groups/${groupId}`);
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Import failed",
    };
  }
}
