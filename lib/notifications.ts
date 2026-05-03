import webpush from "web-push";
import type { NotificationType } from "@/app/generated/prisma/enums";
import { db } from "@/lib/db";

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL;
  if (!publicKey || !privateKey || !email) return false;
  webpush.setVapidDetails(email, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export type CreateNotificationInput = {
  type: NotificationType;
  title: string;
  message: string;
  alertId?: string;
  metadata?: Record<string, unknown>;
};

export async function createNotification(input: CreateNotificationInput) {
  const created = await db.notification.create({
    data: {
      type: input.type,
      title: input.title,
      message: input.message,
      alertId: input.alertId,
      metadata: input.metadata ? (input.metadata as object) : undefined,
    },
  });

  await sendPush(input.title, input.message, {
    notificationId: created.id,
    alertId: input.alertId,
  });

  return created;
}

async function sendPush(
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!ensureVapid()) return;

  const settings = await db.settings.findUnique({ where: { id: "singleton" } });
  if (!settings?.pushEnabled || !settings.pushSubscription) return;

  try {
    const subscription =
      settings.pushSubscription as unknown as webpush.PushSubscription;
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title, body, data }),
    );
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "statusCode" in err &&
      (err as { statusCode: number }).statusCode === 410
    ) {
      // Subscription expired — clear it
      await db.settings.update({
        where: { id: "singleton" },
        data: { pushEnabled: false, pushSubscription: undefined },
      });
    } else {
      console.error("[push]", err);
    }
  }
}
