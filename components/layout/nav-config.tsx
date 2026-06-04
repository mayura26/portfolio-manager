import {
  Bell,
  Bookmark,
  Briefcase,
  ClipboardCheck,
  Layers,
  LayoutDashboard,
  LineChart,
  Radar,
  Settings,
  Trophy,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";

const ICON_CLASS = "h-4 w-4";
const ICON_STROKE = 1.5;

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

export const PRIMARY_NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard className={ICON_CLASS} strokeWidth={ICON_STROKE} />,
  },
  {
    href: "/groups",
    label: "Groups",
    icon: <Layers className={ICON_CLASS} strokeWidth={ICON_STROKE} />,
  },
  {
    href: "/portfolios",
    label: "Portfolios",
    icon: <Briefcase className={ICON_CLASS} strokeWidth={ICON_STROKE} />,
  },
  {
    href: "/stocks",
    label: "Stocks",
    icon: <LineChart className={ICON_CLASS} strokeWidth={ICON_STROKE} />,
  },
  {
    href: "/alerts",
    label: "Alerts",
    icon: <Bell className={ICON_CLASS} strokeWidth={ICON_STROKE} />,
  },
  {
    href: "/reviews",
    label: "Reviews",
    icon: <ClipboardCheck className={ICON_CLASS} strokeWidth={ICON_STROKE} />,
  },
  {
    href: "/watchlist",
    label: "Watchlist",
    icon: <Bookmark className={ICON_CLASS} strokeWidth={ICON_STROKE} />,
  },
  {
    href: "/signals",
    label: "Smart Money",
    icon: <Radar className={ICON_CLASS} strokeWidth={ICON_STROKE} />,
  },
  {
    href: "/stats",
    label: "Stats",
    icon: <Trophy className={ICON_CLASS} strokeWidth={ICON_STROKE} />,
  },
  {
    href: "/import",
    label: "Import",
    icon: <Upload className={ICON_CLASS} strokeWidth={ICON_STROKE} />,
  },
];

export const SECONDARY_NAV: NavItem[] = [
  {
    href: "/settings",
    label: "Settings",
    icon: <Settings className={ICON_CLASS} strokeWidth={ICON_STROKE} />,
  },
];
