"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { cashTransactionSchema } from "@/lib/validators";

export type CashActionState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function parseFormData(formData: FormData) {
  return cashTransactionSchema.safeParse({
    type: formData.get("type"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    date: formData.get("date"),
    notes: formData.get("notes"),
  });
}

export async function addCashTransaction(
  groupId: string,
  _prev: CashActionState | undefined,
  formData: FormData,
): Promise<CashActionState> {
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await db.cashTransaction.create({
    data: {
      groupId,
      type: parsed.data.type,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      date: parsed.data.date,
      notes: parsed.data.notes,
    },
  });

  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/cash`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateCashTransaction(
  transactionId: string,
  _prev: CashActionState | undefined,
  formData: FormData,
): Promise<CashActionState> {
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const updated = await db.cashTransaction.update({
    where: { id: transactionId },
    data: {
      type: parsed.data.type,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      date: parsed.data.date,
      notes: parsed.data.notes,
    },
  });

  revalidatePath(`/groups/${updated.groupId}`);
  revalidatePath(`/groups/${updated.groupId}/cash`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteCashTransaction(
  transactionId: string,
): Promise<void> {
  const tx = await db.cashTransaction.findUnique({
    where: { id: transactionId },
  });
  if (!tx) return;
  await db.cashTransaction.delete({ where: { id: transactionId } });
  revalidatePath(`/groups/${tx.groupId}`);
  revalidatePath(`/groups/${tx.groupId}/cash`);
  revalidatePath("/dashboard");
}
