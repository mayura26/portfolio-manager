"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Props = {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
};

export function NavLink({ href, label, icon, exact = false }: Props) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      className={[
        "group flex items-center gap-3 px-3 py-2 text-sm transition-colors",
        "border-l-2",
        active
          ? "border-l-accent text-foreground bg-surface"
          : "border-l-transparent text-muted hover:text-foreground hover:bg-surface/60",
      ].join(" ")}
    >
      <span
        className={[
          "shrink-0 transition-colors",
          active ? "text-accent" : "text-subtle group-hover:text-muted",
        ].join(" ")}
        aria-hidden
      >
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}
