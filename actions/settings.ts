"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { settingsSchema } from "@/lib/validators";

export type SettingsActionState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const SINGLETON_ID = "singleton";

export { getSettings };

export async function updateSettings(
  _prev: SettingsActionState | undefined,
  formData: FormData,
): Promise<SettingsActionState> {
  const parsed = settingsSchema.safeParse({
    defaultBaseCurrency: formData.get("defaultBaseCurrency"),
    pushEnabled: formData.get("pushEnabled") === "on",
    watchlistAiModel: formData.get("watchlistAiModel") ?? undefined,
    watchlistAiReasoning: formData.get("watchlistAiReasoning") ?? undefined,
    minTradePercent: formData.get("minTradePercent") ?? undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await db.settings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...parsed.data },
    update: parsed.data,
  });

  revalidatePath("/settings");
  return { ok: true };
}
