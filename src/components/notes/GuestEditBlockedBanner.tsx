import { useState } from "react";
import { Lock } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button.tsx";
import { GuestUpgradeModal } from "@/components/GuestUpgradeModal.tsx";

/** Shown instead of an editable editor when a guest account has view
 * access to a note that would otherwise be editable (room or public share
 * with edit access) — guests can freely edit their own notes, just not
 * collaborate on someone else's, which is exactly the moment to nudge them
 * toward a real account. */
export function GuestEditBlockedBanner() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-hover p-3">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          This note is shared for editing — create an account to collaborate on it.
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="shrink-0">
          Create account
        </Button>
      </div>
      <GuestUpgradeModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
