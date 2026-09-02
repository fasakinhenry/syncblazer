import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { api } from "@/lib/api.ts";
import { getAnalyticsSessionId } from "@/lib/analyticsSession.ts";

// Fires a lightweight, best-effort pageview beacon on every route change —
// powers the built-in "visits" numbers in the admin dashboard. Renders
// nothing; mount once near the app root, inside the router.
export function AnalyticsBeacon() {
  const location = useLocation();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    const path = location.pathname + location.search;
    if (lastPathRef.current === path) return;
    lastPathRef.current = path;

    api.analytics.pageview({
      path,
      referrer: document.referrer || undefined,
      sessionId: getAnalyticsSessionId(),
    });

    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    if (gtag) gtag("event", "page_view", { page_path: path });
  }, [location]);

  return null;
}
