"use server";

import { revalidatePath } from "next/cache";
import { NotificationType } from "@/app/generated/prisma/enums";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

function revalidate() {
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  await db.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });
  revalidate();
}

export async function dismissNotification(
  notificationId: string,
): Promise<void> {
  await db.notification.update({
    where: { id: notificationId },
    data: { dismissed: true, read: true },
  });
  revalidate();
}

export async function markAllNotificationsRead(): Promise<void> {
  await db.notification.updateMany({
    where: { read: false },
    data: { read: true },
  });
  revalidate();
}

export async function dismissAllNotifications(): Promise<void> {
  await db.notification.updateMany({
    where: { dismissed: false },
    data: { dismissed: true, read: true },
  });
  revalidate();
}

export async function sendTestNotification(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await createNotification({
      type: NotificationType.SYSTEM,
      title: "Ledger test notification",
      message: "Push notifications are connected for this device.",
      metadata: { source: "settings-test" },
    });
    revalidate();
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Could not send test notification",
    };
  }
}
