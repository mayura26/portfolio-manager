"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TABS = [
  { value: "PENDING", label: "Pending" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "all", label: "All" },
] as const;

export function ReviewFilters() {
  const params = useSearchParams();
  const current = params.get("status") ?? "PENDING";

  return (
    <nav className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const active = tab.value === current;
        const href = tab.value === "all" ? "/reviews" : `/reviews?status=${tab.value}`;
        return (
          <Link
            key={tab.value}
            href={href}
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
