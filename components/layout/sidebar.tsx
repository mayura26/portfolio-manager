import Link from "next/link";
import { AppLogo } from "./app-logo";
import { PRIMARY_NAV, SECONDARY_NAV } from "./nav-config";
import { NavLink } from "./nav-link";

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-border md:bg-background">
      <div className="px-5 py-6">
        <Link href="/dashboard" className="block">
          <AppLogo />
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
        <AppLogo />
      </div>
    </aside>
  );
}
