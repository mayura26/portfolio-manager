"use server";

import { revalidatePath } from "next/cache";
import { runCongressSync } from "@/lib/congress-trades";

export type CongressSyncActionResult =
  | { ok: true; inserted: number; skipped: number; filingCount: number }
  | { ok: false; error: string };

export async function syncCongressTrades(): Promise<CongressSyncActionResult> {
  try {
    const result = await runCongressSync("manual");
    revalidatePath("/congress");
    return {
      ok: true,
      inserted: result.inserted,
      skipped: result.skipped,
      filingCount: result.filingCount,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Sync failed",
    };
  }
}
