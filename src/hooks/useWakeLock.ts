import { useEffect, useRef } from "react";

/** Keeps the screen from locking while `active` is true (a transfer is
 * sending or receiving) — the single biggest cause of a phone silently
 * killing a transfer mid-flight. Feature-detected: no-op on browsers
 * without Wake Lock support (notably Safari before 16.4), so callers don't
 * need to check availability themselves.
 *
 * Important limitation this can't fix: Wake Lock only prevents the SCREEN
 * from locking. It does nothing if the user switches away to another app —
 * mobile OSes still suspend a backgrounded tab's JS regardless, and no web
 * API can override that. Surface that distinction in the UI rather than
 * letting people think this guarantees a transfer survives backgrounding. */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Some browsers refuse this in certain contexts (e.g. low battery) —
        // nothing useful to do beyond letting the transfer proceed without it.
      }
    };

    void acquire();

    // The API auto-releases the lock whenever the tab is hidden — re-acquire
    // the moment it's visible again if we're still meant to be active.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !sentinelRef.current) void acquire();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinelRef.current?.release();
      sentinelRef.current = null;
    };
  }, [active]);
}
