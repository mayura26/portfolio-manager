import { Bell } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/db";

export async function NotificationBell() {
  const unread = await db.notification.count({
    where: { read: false, dismissed: false },
  });

  return (
    <Link
      href="/notifications"
      aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
    >
      <Bell className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      {unread > 0 ? (
        <span className="tabular absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium leading-none text-accent-foreground">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

export function NotificationBellSkeleton() {
  return (
    <div className="flex h-9 w-9 items-center justify-center text-subtle">
      <Bell className="h-4 w-4" strokeWidth={1.5} aria-hidden />
    </div>
  );
}
