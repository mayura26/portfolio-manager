"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/signals", label: "Overview" },
  { href: "/signals/government", label: "Government" },
  { href: "/signals/insiders", label: "Insiders" },
] as const;

export function SignalsSectionTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const active =
          tab.href === "/signals"
            ? pathname === "/signals"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={[
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-accent text-foreground"
                : "border-transparent text-muted hover:text-foreground",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
