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
    investmentObjective: formData.get("investmentObjective"),
    riskTolerance: formData.get("riskTolerance"),
    timeHorizon: formData.get("timeHorizon"),
    liquidityNeed: formData.get("liquidityNeed"),
    investmentProfileNotes: formData.get("investmentProfileNotes"),
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
    data: {
      ...parsed.data,
      cashTargetPercent: "100",
      cashTargetMinPercent: "100",
      cashTargetMaxPercent: "100",
    },
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
  await db.$transaction(async (tx) => {
    await tx.portfolio.deleteMany({ where: { groupId } });
    await tx.portfolioGroup.delete({ where: { id: groupId } });
  });

  revalidatePath("/groups");
  revalidatePath("/dashboard");
  revalidatePath("/portfolios");
  revalidatePath("/import");
  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/settings`);
  redirect("/groups");
}

export async function updateGroupIbkr(
  groupId: string,
  _prev: GroupActionState | undefined,
  formData: FormData,
): Promise<GroupActionState> {
  const token = formData.get("ibkrFlexToken");
  const queryId = formData.get("ibkrFlexQueryId");

  await db.portfolioGroup.update({
    where: { id: groupId },
    data: {
      ibkrFlexToken:
        typeof token === "string" && token.trim() ? token.trim() : null,
      ibkrFlexQueryId:
        typeof queryId === "string" && queryId.trim() ? queryId.trim() : null,
    },
  });

  revalidatePath(`/groups/${groupId}/settings`);
  return { ok: true };
}

/**
 * Bulk-set the target ranges for every portfolio in a group plus the cash slot.
 * Validates that the combined ranges allow a 100% allocation.
 */
export async function setGroupTargets(
  groupId: string,
  _prev: GroupActionState | undefined,
  formData: FormData,
): Promise<GroupActionState> {
  const cashTargetMinPercent =
    formData.get("cashTargetMinPercent")?.toString() ?? "0";
  const cashTargetMaxPercent =
    formData.get("cashTargetMaxPercent")?.toString() ?? "0";
  const portfolioIds = formData.getAll("portfolioId").map((v) => v.toString());
  const portfolioMinTargets = formData
    .getAll("portfolioTargetMinPercent")
    .map((v) => v.toString());
  const portfolioMaxTargets = formData
    .getAll("portfolioTargetMaxPercent")
    .map((v) => v.toString());

  if (
    portfolioIds.length !== portfolioMinTargets.length ||
    portfolioIds.length !== portfolioMaxTargets.length
  ) {
    return { ok: false, error: "Mismatched portfolio target inputs" };
  }

  const parsed = groupTargetsSchema.safeParse({
    cashTargetMinPercent,
    cashTargetMaxPercent,
    portfolios: portfolioIds.map((id, i) => ({
      portfolioId: id,
      targetMinPercent: portfolioMinTargets[i],
      targetMaxPercent: portfolioMaxTargets[i],
    })),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Target ranges must allow a 100% allocation",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await db.$transaction(async (tx) => {
    await tx.portfolioGroup.update({
      where: { id: groupId },
      data: {
        cashTargetPercent: parsed.data.cashTargetPercent,
        cashTargetMinPercent: parsed.data.cashTargetMinPercent,
        cashTargetMaxPercent: parsed.data.cashTargetMaxPercent,
      },
    });
    for (const p of parsed.data.portfolios) {
      await tx.portfolio.update({
        where: { id: p.portfolioId },
        data: {
          targetPercentInGroup: p.targetPercent,
          targetMinPercentInGroup: p.targetMinPercent,
          targetMaxPercentInGroup: p.targetMaxPercent,
        },
      });
    }
  });

  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/settings`);
  revalidatePath("/dashboard");
  return { ok: true };
}
