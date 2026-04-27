"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { dismissNotification, markNotificationRead } from "@/actions/notifications";
import { formatRelative } from "@/lib/format";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  dismissed: boolean;
  createdAt: Date;
};

export function NotificationItem({ notification }: { notification: Notification }) {
  const [pending, startTransition] = useTransition();

  return (
    <li
      className={[
        "hairline flex items-start justify-between gap-3 bg-surface-elevated px-4 py-3",
        notification.read ? "" : "border-l-2 border-l-accent",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{notification.title}</p>
        <p className="mt-1 text-sm text-muted">{notification.message}</p>
        <p className="label mt-2">{formatRelative(notification.createdAt)}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        {!notification.read ? (
          <button
            type="button"
            onClick={() =>
              startTransition(() => {
                void markNotificationRead(notification.id);
              })
            }
            disabled={pending}
            aria-label="Mark as read"
            className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-foreground"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() =>
            startTransition(() => {
              void dismissNotification(notification.id);
            })
          }
          disabled={pending}
          aria-label="Dismiss"
          className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </li>
  );
}
