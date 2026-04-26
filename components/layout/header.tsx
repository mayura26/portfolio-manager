import Link from "next/link";
import { Bell } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
      <div className="md:hidden">
        <Link href="/dashboard" className="display text-lg text-foreground">
          Ledger
        </Link>
      </div>

      <div className="hidden md:block" />

      <div className="flex items-center gap-2">
        <Link
          href="/notifications"
          aria-label="Notifications"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <Bell className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        </Link>
      </div>
    </header>
  );
}
