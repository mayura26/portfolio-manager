"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  portfolioId: string;
};

export function PortfolioTabs({ portfolioId }: Props) {
  const pathname = usePathname();
  const base = `/portfolios/${portfolioId}`;

  const tabs = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/trades`, label: "Trades" },
    { href: `${base}/alerts`, label: "Alerts" },
    { href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <nav className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
