import { NavLink } from "react-router-dom";
import { ShieldCheck } from "@phosphor-icons/react";
import { NAV_ITEMS } from "@/components/layout/nav.ts";
import { InstallAppButton } from "@/components/InstallAppButton.tsx";
import { Logo } from "@/components/Logo.tsx";
import { isAdminEmail } from "@/components/ProtectedRoute.tsx";
import { useAuth } from "@/context/AuthContext.tsx";

export function Sidebar() {
  const { user } = useAuth();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="px-6 py-5">
        <Logo to="/room" />
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon, emphasize }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/room"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-soft text-brand"
                  : emphasize
                    ? "text-brand hover:bg-brand-soft"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="h-5 w-5" weight={isActive ? "fill" : "regular"} />
                {label}
              </>
            )}
          </NavLink>
        ))}
        {isAdminEmail(user?.email) && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? "bg-brand-soft text-brand" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <ShieldCheck className="h-5 w-5" weight={isActive ? "fill" : "regular"} />
                Admin
              </>
            )}
          </NavLink>
        )}
      </nav>

      <div className="px-3 pb-4">
        <InstallAppButton className="w-full" />
      </div>
    </aside>
  );
}
