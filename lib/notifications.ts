import webpush from "web-push";
import type { NotificationType } from "@/app/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  type BuildNotificationBatchOptions,
  buildNotificationBatches,
  type NotificationBatchCandidate,
} from "@/lib/notification-batching";

const SINGLETON_ID = "singleton";

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;

  const publicKey =
    process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL;

  if (!publicKey || !privateKey || !email) return false;

  const subject = email.includes(":") ? email : `mailto:${email}`;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export type CreateNotificationInput = {
  type: NotificationType;
  title: string;
  message: string;
  alertId?: string;
  metadata?: Record<string, unknown>;
  push?: boolean;
  visibleInInbox?: boolean;
  url?: string;
};

export async function createNotification(input: CreateNotificationInput) {
  const visibleInInbox = input.visibleInInbox ?? true;
  const metadata = input.url
    ? { ...(input.metadata ?? {}), url: input.url }
    : input.metadata;

  const created = await db.notification.create({
    data: {
      type: input.type,
      title: input.title,
      message: input.message,
      read: !visibleInInbox,
      dismissed: !visibleInInbox,
      alertId: input.alertId,
      metadata: metadata ? (metadata as object) : undefined,
    },
  });

  if (input.push !== false) {
    await sendPush(input.title, input.message, {
      notificationId: created.id,
      alertId: input.alertId,
      url: input.url ?? "/notifications",
    });
  }

  return created;
}

export async function createBatchedNotifications(
  candidates: NotificationBatchCandidate[],
  options?: BuildNotificationBatchOptions,
) {
  const batches = buildNotificationBatches(candidates, options);
  const created = [];

  for (const batch of batches) {
    created.push(await createNotification(batch));
  }

  return created;
}

async function sendPush(
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!ensureVapid()) return;

  const settings = await db.settings.findUnique({
    where: { id: SINGLETON_ID },
  });
  if (!settings?.pushEnabled) return;

  const subscriptions = await db.pushSubscription.findMany();
  if (subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify({
            title,
            body,
            icon: "/notification-icon.svg",
            badge: "/notification-badge.svg",
            data,
          }),
        );
      } catch (err) {
        await handlePushError(subscription.endpoint, err);
      }
    }),
  );
}

async function handlePushError(endpoint: string, err: unknown): Promise<void> {
  if (isExpiredSubscription(err)) {
    await db.$transaction(async (tx) => {
      await tx.pushSubscription.deleteMany({ where: { endpoint } });
      const count = await tx.pushSubscription.count();
      if (count === 0) {
        await tx.settings.updateMany({
          where: { id: SINGLETON_ID },
          data: { pushEnabled: false },
        });
      }
      return count;
    });
    return;
  }

  console.error("[push]", err);
}

function isExpiredSubscription(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "statusCode" in err &&
    ((err as { statusCode: number }).statusCode === 404 ||
      (err as { statusCode: number }).statusCode === 410)
  );
}
