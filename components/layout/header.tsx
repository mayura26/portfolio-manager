import { Suspense } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NotificationBell, NotificationBellSkeleton } from "@/components/notifications/notification-bell";

export function Header() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <Suspense fallback={<MobileNavFallback />}>
          <MobileNav />
        </Suspense>
        <Link href="/dashboard" className="display text-lg text-foreground">
          Ledger
        </Link>
      </div>

      <div className="hidden md:block" />

      <div className="flex items-center gap-2">
        <Suspense fallback={<NotificationBellSkeleton />}>
          <NotificationBell />
        </Suspense>
      </div>
    </header>
  );
}

function MobileNavFallback() {
  return (
    <div className="flex h-9 w-9 items-center justify-center text-subtle md:hidden">
      <Menu className="h-4 w-4" strokeWidth={1.5} aria-hidden />
    </div>
  );
}
