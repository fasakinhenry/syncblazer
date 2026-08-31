import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar.tsx";
import { MobileNav } from "@/components/layout/MobileNav.tsx";
import { TopBar } from "@/components/layout/TopBar.tsx";
import { IncomingTransfers } from "@/components/IncomingTransfers.tsx";

export function AppShell() {
  return (
    <div className="flex h-dvh bg-background text-text-primary">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-6 md:px-8 md:pb-8">
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <IncomingTransfers />
    </div>
  );
}
