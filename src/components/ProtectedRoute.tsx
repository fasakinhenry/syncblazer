import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";

export function ProtectedRoute() {
  const { status } = useAuth();

  if (status === "loading") return <PageSpinner />;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;

  return <Outlet />;
}

export function GuestRoute() {
  const { status } = useAuth();

  if (status === "loading") return <PageSpinner />;
  if (status === "authenticated") return <Navigate to="/room" replace />;

  return <Outlet />;
}

/** Landing page: shown to signed-out visitors, skipped straight to the app for signed-in users. */
export function PublicRoute() {
  const { status } = useAuth();

  if (status === "loading") return <PageSpinner />;
  if (status === "authenticated") return <Navigate to="/room" replace />;

  return <Outlet />;
}

export function isAdminEmail(email?: string): boolean {
  if (!email) return false;
  const allowed = (import.meta.env.VITE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

/** Client-side gate for /admin — purely a UX nicety so the page/nav-link
 * isn't shown to people who'll just get a 403. The backend's own
 * requireAdmin middleware is the real enforcement; this never substitutes
 * for it. */
export function AdminRoute() {
  const { status, user } = useAuth();

  if (status === "loading") return <PageSpinner />;
  if (status === "unauthenticated" || !isAdminEmail(user?.email)) return <Navigate to="/room" replace />;

  return <Outlet />;
}
