import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "@/components/layout/nav.ts";

export function MobileNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Primary"
    >
      {NAV_ITEMS.map(({ to, label, icon: Icon, emphasize }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/room"}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs"
        >
          {({ isActive }) =>
            emphasize ? (
              <span className="-mt-6 flex flex-col items-center gap-1">
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg shadow-brand/30 transition-colors ${
                    isActive ? "bg-brand-hover" : "bg-brand"
                  }`}
                >
                  <Icon weight="fill" className="h-6 w-6 text-white" />
                </span>
                <span className={isActive ? "font-medium text-brand" : "text-text-secondary"}>{label}</span>
              </span>
            ) : (
              <>
                <Icon weight={isActive ? "fill" : "regular"} className={`h-5 w-5 ${isActive ? "text-brand" : "text-text-secondary"}`} />
                <span className={isActive ? "font-medium text-brand" : "text-text-secondary"}>{label}</span>
              </>
            )
          }
        </NavLink>
      ))}
    </nav>
  );
}
