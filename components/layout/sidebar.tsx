import Link from "next/link";
import {
  Bell,
  Briefcase,
  ClipboardCheck,
  LayoutDashboard,
  LineChart,
  Settings,
} from "lucide-react";
import { NavLink } from "./nav-link";

const ICON_CLASS = "h-4 w-4";
const ICON_STROKE = 1.5;

const PRIMARY_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className={ICON_CLASS} strokeWidth={ICON_STROKE} /> },
  { href: "/portfolios", label: "Portfolios", icon: <Briefcase className={ICON_CLASS} strokeWidth={ICON_STROKE} /> },
  { href: "/stocks", label: "Stocks", icon: <LineChart className={ICON_CLASS} strokeWidth={ICON_STROKE} /> },
  { href: "/alerts", label: "Alerts", icon: <Bell className={ICON_CLASS} strokeWidth={ICON_STROKE} /> },
  { href: "/reviews", label: "Reviews", icon: <ClipboardCheck className={ICON_CLASS} strokeWidth={ICON_STROKE} /> },
];

const SECONDARY_NAV = [
  { href: "/settings", label: "Settings", icon: <Settings className={ICON_CLASS} strokeWidth={ICON_STROKE} /> },
];

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-border md:bg-background">
      <div className="px-5 py-6">
        <Link href="/dashboard" className="block">
          <h1 className="display text-2xl text-foreground">Ledger</h1>
          <p className="label mt-1">Portfolio Manager</p>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-6 px-2 pb-6">
        <div className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </div>

        <div className="flex flex-col gap-0.5">
          <p className="label px-3 pb-2">Configuration</p>
          {SECONDARY_NAV.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </div>
      </nav>
    </aside>
  );
}

export function SidebarSkeleton() {
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-border md:bg-background">
      <div className="px-5 py-6">
        <h1 className="display text-2xl text-foreground">Ledger</h1>
        <p className="label mt-1">Portfolio Manager</p>
      </div>
    </aside>
  );
}
