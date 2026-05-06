"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { groupTargetsSchema, portfolioGroupSchema } from "@/lib/validators";

export type GroupActionState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function parseFormData(formData: FormData) {
  return portfolioGroupSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    baseCurrency: formData.get("baseCurrency"),
  });
}

export async function createGroup(
  _prev: GroupActionState | undefined,
  formData: FormData,
): Promise<GroupActionState> {
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const group = await db.portfolioGroup.create({
    data: { ...parsed.data, cashTargetPercent: "100" },
  });

  revalidatePath("/groups");
  revalidatePath("/dashboard");
  redirect(`/groups/${group.id}`);
}

export async function updateGroup(
  groupId: string,
  _prev: GroupActionState | undefined,
  formData: FormData,
): Promise<GroupActionState> {
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await db.portfolioGroup.update({
    where: { id: groupId },
    data: parsed.data,
  });

  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}

export async function deleteGroup(groupId: string): Promise<void> {
  await db.portfolioGroup.delete({ where: { id: groupId } });
  revalidatePath("/groups");
  redirect("/groups");
}

/**
 * Bulk-set the target weights for every portfolio in a group plus the cash slot.
 * Validates that they sum to exactly 100%.
 */
export async function setGroupTargets(
  groupId: string,
  _prev: GroupActionState | undefined,
  formData: FormData,
): Promise<GroupActionState> {
  const cashTargetPercent =
    formData.get("cashTargetPercent")?.toString() ?? "0";
  const portfolioIds = formData.getAll("portfolioId").map((v) => v.toString());
  const portfolioTargets = formData
    .getAll("portfolioTargetPercent")
    .map((v) => v.toString());

  if (portfolioIds.length !== portfolioTargets.length) {
    return { ok: false, error: "Mismatched portfolio target inputs" };
  }

  const parsed = groupTargetsSchema.safeParse({
    cashTargetPercent,
    portfolios: portfolioIds.map((id, i) => ({
      portfolioId: id,
      targetPercent: portfolioTargets[i],
    })),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Targets must sum to exactly 100%",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await db.$transaction(async (tx) => {
    await tx.portfolioGroup.update({
      where: { id: groupId },
      data: { cashTargetPercent: parsed.data.cashTargetPercent },
    });
    for (const p of parsed.data.portfolios) {
      await tx.portfolio.update({
        where: { id: p.portfolioId },
        data: { targetPercentInGroup: p.targetPercent },
      });
    }
  });

  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/settings`);
  revalidatePath("/dashboard");
  return { ok: true };
}
