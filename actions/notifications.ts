"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

function revalidate() {
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await db.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });
  revalidate();
}

export async function dismissNotification(notificationId: string): Promise<void> {
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
