"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditCheckKeySchema } from "@/lib/validators";

export async function muteAuditCheck(checkKey: string): Promise<void> {
  const key = auditCheckKeySchema.parse(checkKey);
  await db.mutedAuditCheck.upsert({
    where: { checkKey: key },
    create: { checkKey: key },
    update: {},
  });
  revalidatePath("/reviews/audit");
}

export async function unmuteAuditCheck(checkKey: string): Promise<void> {
  const key = auditCheckKeySchema.parse(checkKey);
  await db.mutedAuditCheck.deleteMany({ where: { checkKey: key } });
  revalidatePath("/reviews/audit");
}
