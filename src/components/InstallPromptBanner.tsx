import { useEffect, useState } from "react";
import { DownloadSimple, Export, X } from "@phosphor-icons/react";
import { usePwaInstall } from "@/hooks/usePwaInstall.ts";
import { Button } from "@/components/ui/Button.tsx";
import { useToast } from "@/context/ToastContext.tsx";

const DISMISSED_AT_KEY = "syncblaze.installPromptDismissedAt";
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks — enough not to nag, short enough to ask again
const SHOW_DELAY_MS = 4000; // let the page settle before asking for anything

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISSED_AT_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function dismiss(): void {
  try {
    localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
  } catch {
    // Private browsing / storage disabled — worst case it asks again next time.
  }
}

/** Proactively offers to install the PWA, instead of only being
 * discoverable via the Install button tucked into the sidebar/profile —
 * most PWA sites surface this unprompted. Shown once per ~2 weeks per
 * browser, a few seconds after load, and never once actually installed.
 * Chromium browsers get a real one-tap install; iOS/iPadOS Safari has no
 * programmatic install prompt at all, so it gets Share -> "Add to Home
 * Screen" instructions instead. */
export function InstallPromptBanner() {
  const { canInstall, needsManualIosInstall, installed, promptInstall } = usePwaInstall();
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (installed || recentlyDismissed()) return;
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [installed]);

  const onDismiss = () => {
    dismiss();
    setDismissed(true);
  };

  const onInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) {
      toast("Installing SyncBlaze…", "success");
      setDismissed(true);
    } else {
      dismiss();
      setDismissed(true);
    }
  };

  if (!visible || dismissed || installed || (!canInstall && !needsManualIosInstall)) return null;

  return (
    <div className="fixed inset-x-0 bottom-36 z-50 flex justify-center px-4 md:bottom-24">
      <div className="flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-lg">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <DownloadSimple className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">Install SyncBlaze</p>
          {canInstall ? (
            <>
              <p className="mt-0.5 text-xs text-text-secondary">Quick access from your home screen, works offline.</p>
              <Button size="sm" onClick={onInstall} className="mt-2 gap-1.5">
                <DownloadSimple className="h-3.5 w-3.5" />
                Install
              </Button>
            </>
          ) : (
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-text-secondary">
              Tap <Export className="h-3.5 w-3.5 shrink-0" /> Share, then "Add to Home Screen".
            </p>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-text-secondary hover:bg-surface-hover"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
