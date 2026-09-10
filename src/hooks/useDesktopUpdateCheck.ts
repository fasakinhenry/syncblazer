import { useEffect, useState } from "react";
import { getAppVersion, isTauri } from "@/lib/tauri.ts";
import { getDesktopReleaseInfo, isNewerVersion, type DesktopReleaseInfo } from "@/lib/desktopReleases.ts";

export interface DesktopUpdateState {
  /** False outside the desktop app (a normal browser tab/PWA) — nothing to check. */
  applicable: boolean;
  checked: boolean;
  updateAvailable: boolean;
  currentVersion: string | null;
  release: DesktopReleaseInfo | null;
}

/** Checks the installed desktop app's own version against the latest
 * GitHub release, purely so the Profile page can tell you a newer build
 * exists — there's no auto-updater wired up yet, so this is "go grab it
 * yourself from Downloads," not a silent background update. */
export function useDesktopUpdateCheck(): DesktopUpdateState {
  const [state, setState] = useState<DesktopUpdateState>({
    applicable: isTauri(),
    checked: false,
    updateAvailable: false,
    currentVersion: null,
    release: null,
  });

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;

    Promise.all([getAppVersion(), getDesktopReleaseInfo()]).then(([currentVersion, release]) => {
      if (cancelled) return;
      setState({
        applicable: true,
        checked: true,
        updateAvailable: !!release && isNewerVersion(currentVersion, release.version),
        currentVersion,
        release,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
