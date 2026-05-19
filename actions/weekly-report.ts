"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { weekStartSchema } from "@/lib/validators";
import { parseWeekStart, weekEndOf } from "@/lib/week-range";
import { getOrCreateWeeklyReport } from "@/lib/weekly-report";

export type WeeklyReportActionState =
  | { ok: true }
  | { ok: false; error: string };

export async function generateWeeklyReport(
  weekStartIso: string,
): Promise<WeeklyReportActionState> {
  const parsed = weekStartSchema.safeParse(weekStartIso);
  if (!parsed.success) {
    return { ok: false, error: "Invalid week" };
  }

  const weekStart = parseWeekStart(parsed.data);
  const weekEnd = weekEndOf(weekStart);

  try {
    await getOrCreateWeeklyReport(weekStart, weekEnd);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to generate report",
    };
  }

  revalidatePath("/reviews/weekly");
  return { ok: true };
}

export async function regenerateWeeklyReport(
  reportId: string,
): Promise<WeeklyReportActionState> {
  const existing = await db.weeklyReport.findUnique({
    where: { id: reportId },
  });
  if (!existing) {
    return { ok: false, error: "Report not found" };
  }

  try {
    await getOrCreateWeeklyReport(existing.weekStart, existing.weekEnd, {
      force: true,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to regenerate report",
    };
  }

  revalidatePath("/reviews/weekly");
  revalidatePath(`/reviews/weekly/${reportId}`);
  return { ok: true };
}
