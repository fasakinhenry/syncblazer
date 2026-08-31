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
