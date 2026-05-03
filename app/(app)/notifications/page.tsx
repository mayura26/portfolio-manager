import { BellOff } from "lucide-react";
import { Suspense } from "react";
import {
  dismissAllNotifications,
  markAllNotificationsRead,
} from "@/actions/notifications";
import { NotificationItem } from "@/components/notifications/notification-item";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b border-border pb-6">
        <p className="label">Inbox</p>
        <h1 className="display mt-2 text-4xl text-foreground">Notifications</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Triggered alerts and system messages. Dismissed items are hidden.
        </p>
      </header>

      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <NotificationsList />
      </Suspense>
    </div>
  );
}

async function NotificationsList() {
  const notifications = await db.notification.findMany({
    where: { dismissed: false },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title="Nothing to show"
        description="When alerts trigger they appear here. Run the alerts cron to evaluate active alerts."
      />
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {unreadCount} unread of {notifications.length}
        </span>
        <div className="flex items-center gap-3">
          {unreadCount > 0 ? (
            <form action={markAllNotificationsRead}>
              <button
                type="submit"
                className="text-muted hover:text-foreground"
              >
                Mark all read
              </button>
            </form>
          ) : null}
          <form action={dismissAllNotifications}>
            <button type="submit" className="text-muted hover:text-foreground">
              Dismiss all
            </button>
          </form>
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {notifications.map((n) => (
          <NotificationItem key={n.id} notification={n} />
        ))}
      </ul>
    </div>
  );
}
