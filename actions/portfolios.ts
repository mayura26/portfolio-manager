"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { portfolioSchema } from "@/lib/validators";

export type ActionState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function parseFormData(formData: FormData) {
  return portfolioSchema.safeParse({
    groupId: formData.get("groupId")?.toString() ?? "",
    name: formData.get("name"),
    description: formData.get("description"),
    baseCurrency: formData.get("baseCurrency"),
  });
}

export async function createPortfolio(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const group = await db.portfolioGroup.findUnique({
    where: { id: parsed.data.groupId },
    select: { id: true },
  });
  if (!group) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: { groupId: ["Group not found"] },
    };
  }

  const portfolio = await db.portfolio.create({ data: parsed.data });

  revalidatePath("/portfolios");
  revalidatePath("/groups");
  revalidatePath(`/groups/${parsed.data.groupId}`);
  revalidatePath(`/groups/${parsed.data.groupId}/settings`);
  revalidatePath("/dashboard");
  redirect(`/portfolios/${portfolio.id}`);
}

export async function updatePortfolio(
  portfolioId: string,
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const [portfolio, group] = await Promise.all([
    db.portfolio.findUnique({
      where: { id: portfolioId },
      select: { groupId: true },
    }),
    db.portfolioGroup.findUnique({
      where: { id: parsed.data.groupId },
      select: { id: true },
    }),
  ]);

  if (!portfolio) {
    return { ok: false, error: "Portfolio not found" };
  }

  if (!group) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: { groupId: ["Group not found"] },
    };
  }

  await db.portfolio.update({
    where: { id: portfolioId },
    data: parsed.data,
  });

  revalidatePath("/portfolios");
  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath("/groups");
  revalidatePath(`/groups/${portfolio.groupId}`);
  revalidatePath(`/groups/${portfolio.groupId}/settings`);
  revalidatePath(`/groups/${parsed.data.groupId}`);
  revalidatePath(`/groups/${parsed.data.groupId}/settings`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deletePortfolio(portfolioId: string): Promise<void> {
  const portfolio = await db.portfolio.delete({
    where: { id: portfolioId },
    select: { groupId: true },
  });
  revalidatePath("/portfolios");
  revalidatePath("/groups");
  revalidatePath(`/groups/${portfolio.groupId}`);
  revalidatePath(`/groups/${portfolio.groupId}/settings`);
  revalidatePath("/dashboard");
  redirect("/portfolios");
}
