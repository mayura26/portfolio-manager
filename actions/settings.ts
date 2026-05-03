"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { settingsSchema } from "@/lib/validators";

export type SettingsActionState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const SINGLETON_ID = "singleton";

export async function getSettings() {
  const existing = await db.settings.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;

  return db.settings.create({
    data: { id: SINGLETON_ID },
  });
}

export async function updateSettings(
  _prev: SettingsActionState | undefined,
  formData: FormData,
): Promise<SettingsActionState> {
  const parsed = settingsSchema.safeParse({
    defaultBaseCurrency: formData.get("defaultBaseCurrency"),
    pushEnabled: formData.get("pushEnabled") === "on",
    watchlistAiModel: formData.get("watchlistAiModel") ?? undefined,
    watchlistAiReasoning: formData.get("watchlistAiReasoning") ?? undefined,
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
