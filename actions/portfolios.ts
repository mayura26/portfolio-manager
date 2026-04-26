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

  const portfolio = await db.portfolio.create({ data: parsed.data });

  revalidatePath("/portfolios");
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

  await db.portfolio.update({
    where: { id: portfolioId },
    data: parsed.data,
  });

  revalidatePath("/portfolios");
  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deletePortfolio(portfolioId: string): Promise<void> {
  await db.portfolio.delete({ where: { id: portfolioId } });
  revalidatePath("/portfolios");
  revalidatePath("/dashboard");
  redirect("/portfolios");
}
