import type { NotificationType } from "@/app/generated/prisma/enums";

export const IMPORTANT_NOTIFICATION_PRIORITY = 2;

export type NotificationBatchCandidate = {
  type: NotificationType;
  groupKey: string;
  title: string;
  message: string;
  alertId?: string;
  metadata?: Record<string, unknown>;
  url?: string;
  priority?: number;
  itemLabel?: string;
  batchLabelSingular: string;
  batchLabelPlural: string;
  push?: boolean;
  visibleInInbox?: boolean;
};

export type BatchedNotificationInput = {
  type: NotificationType;
  title: string;
  message: string;
  alertId?: string;
  metadata?: Record<string, unknown>;
  push?: boolean;
  visibleInInbox?: boolean;
  url?: string;
};

export type BuildNotificationBatchOptions = {
  minPriority?: number;
  fallbackUrl?: string;
};

export function buildNotificationBatches(
  candidates: NotificationBatchCandidate[],
  options: BuildNotificationBatchOptions = {},
): BatchedNotificationInput[] {
  const groups = new Map<string, NotificationBatchCandidate[]>();

  for (const candidate of candidates) {
    const key = `${candidate.type}:${candidate.groupKey}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }

  const batches: BatchedNotificationInput[] = [];

  for (const items of groups.values()) {
    const maxPriority = Math.max(...items.map((item) => item.priority ?? 0));
    if (
      options.minPriority !== undefined &&
      maxPriority < options.minPriority
    ) {
      continue;
    }

    if (items.length === 1) {
      const item = items[0];
      batches.push({
        type: item.type,
        title: item.title,
        message: item.message,
        alertId: item.alertId,
        metadata: item.metadata,
        push: item.push,
        visibleInInbox: item.visibleInInbox,
        url: item.url ?? options.fallbackUrl,
      });
      continue;
    }

    const first = items[0];
    const labels = items.map((item) => item.itemLabel ?? item.title);
    const preview = formatItemPreview(labels);

    batches.push({
      type: first.type,
      title: `${items.length} ${first.batchLabelPlural}`,
      message: preview,
      metadata: {
        kind: "batch",
        groupKey: first.groupKey,
        itemCount: items.length,
        items: items.map((item) => ({
          title: item.title,
          message: item.message,
          alertId: item.alertId,
          metadata: item.metadata,
          url: item.url,
          priority: item.priority,
          itemLabel: item.itemLabel,
        })),
      },
      push: items.some((item) => item.push !== false),
      visibleInInbox: items.some((item) => item.visibleInInbox !== false),
      url: options.fallbackUrl ?? first.url,
    });
  }

  return batches;
}

export function formatItemPreview(items: string[], limit = 3): string {
  if (items.length <= limit) return items.join("; ");

  const shown = items.slice(0, limit).join("; ");
  return `${shown}; and ${items.length - limit} more`;
}
