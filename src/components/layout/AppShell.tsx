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
        {/* Bottom padding must clear the fixed MobileNav PLUS the safe-area
         * inset on notched phones — pb-24 alone is a fixed 96px that
         * doesn't grow with env(safe-area-inset-bottom) the way the nav
         * bar itself does, so on taller insets the last bit of scrollable
         * content (e.g. a note's trailing links) ends up hidden behind it. */}
        <main className="flex-1 overflow-y-auto px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 md:px-8 md:pb-8">
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <IncomingTransfers />
    </div>
  );
}
