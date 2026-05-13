"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { type NavItem, PRIMARY_NAV, SECONDARY_NAV } from "./nav-config";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close drawer when the URL changes (pathname must be a dependency).
  // biome-ignore lint/correctness/useExhaustiveDependencies: effect intentionally re-runs on pathname; setOpen is stable but not the trigger
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when open
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const drawer =
    open && mounted ? (
      <div
        className="fixed inset-0 z-100 md:hidden"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden
        />
        <aside className="absolute inset-y-0 left-0 z-1 flex w-[min(20rem,85vw)] max-w-full flex-col border-r border-border bg-background shadow-xl animate-slide-up">
          <div className="flex items-center justify-between px-5 py-6">
            <Link href="/dashboard" className="block">
              <h1 className="display text-2xl text-foreground">Ledger</h1>
              <p className="label mt-1">Portfolio Manager</p>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-2 pb-6">
            <div className="flex flex-col gap-0.5">
              {PRIMARY_NAV.map((item) => (
                <DrawerLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="label px-3 pb-2">Configuration</p>
              {SECONDARY_NAV.map((item) => (
                <DrawerLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </nav>
        </aside>
      </div>
    ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="md:hidden flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-surface hover:text-foreground"
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </button>

      {drawer ? createPortal(drawer, document.body) : null}
    </>
  );
}

function DrawerLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={[
        "flex items-center gap-3 px-3 py-2.5 text-sm transition-colors",
        "border-l-2",
        active
          ? "border-l-accent text-foreground bg-surface"
          : "border-l-transparent text-muted hover:text-foreground hover:bg-surface/60",
      ].join(" ")}
    >
      <span className={active ? "text-accent" : "text-subtle"} aria-hidden>
        {item.icon}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}
