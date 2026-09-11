import { useState } from "react";
import { Bell, X } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { pushSupported, subscribeToPush } from "@/lib/push.ts";

const DISMISS_KEY = "syncblaze.notifPromptDismissed";

function shouldShow(): boolean {
  if (!pushSupported()) return false;
  if (Notification.permission !== "default") return false;
  return localStorage.getItem(DISMISS_KEY) !== "1";
}

export function NotificationPermissionCard() {
  const { toast } = useToast();
  const [visible, setVisible] = useState(shouldShow);
  const [loading, setLoading] = useState(false);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const enable = async () => {
    setLoading(true);
    try {
      const ok = await subscribeToPush();
      if (ok) {
        toast("Notifications enabled", "success");
        setVisible(false);
      } else {
        toast("Couldn't enable notifications on this device", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex items-center justify-between gap-3 border-brand/30 bg-brand-soft p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
          <Bell className="h-4 w-4" weight="fill" />
        </span>
        <div>
          <p className="text-sm font-medium text-text-primary">Turn on notifications</p>
          <p className="text-xs text-text-secondary">Get notified when someone joins a room, shares a note, or sends a message.</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={enable} loading={loading}>
          Enable
        </Button>
        <button
          onClick={dismiss}
          className="rounded-md p-1.5 text-text-secondary hover:bg-surface-hover"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
}
