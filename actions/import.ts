"use server";

import { revalidatePath } from "next/cache";
import { getSettings } from "@/actions/settings";
import { fetchFlexTrades } from "@/lib/import/ibkr-flex";
import { importTrades, type ImportResult } from "@/lib/import/ibkr-engine";

export type ImportActionState =
  | ({ ok: true } & ImportResult)
  | { ok: false; error: string };

export async function triggerFlexSync(
  portfolioId: string,
): Promise<ImportActionState> {
  const settings = await getSettings();

  if (!settings.ibkrFlexToken || !settings.ibkrFlexQueryId) {
    return {
      ok: false,
      error:
        "IBKR Flex Token and Query ID must be configured in Settings before syncing.",
    };
  }

  let trades;
  try {
    trades = await fetchFlexTrades(
      settings.ibkrFlexToken,
      settings.ibkrFlexQueryId,
    );
  } catch (err) {
    return {
      ok: false,
      error: `IBKR connection failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  try {
    const result = await importTrades(trades, portfolioId);
    revalidatePath(`/portfolios/${portfolioId}/trades`);
    revalidatePath(`/portfolios/${portfolioId}`);
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Import failed",
    };
  }
}
