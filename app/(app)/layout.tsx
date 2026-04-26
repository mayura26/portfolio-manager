import { Suspense } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar, SidebarSkeleton } from "@/components/layout/sidebar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen">
      <Suspense fallback={<SidebarSkeleton />}>
        <Sidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
