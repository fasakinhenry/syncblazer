import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { ArrowClockwise } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button.tsx";
import { useToast } from "@/context/ToastContext.tsx";

export function PwaUpdatePrompt() {
  const { toast } = useToast();
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      registration?.update();
    },
  });

  useEffect(() => {
    if (offlineReady) {
      toast("SyncBlaze is ready to work offline.", "success");
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady, toast]);

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-lg">
        <p className="text-sm text-text-primary">A new version of SyncBlaze is ready.</p>
        <Button size="sm" onClick={() => updateServiceWorker(true)} className="gap-1.5 whitespace-nowrap">
          <ArrowClockwise className="h-3.5 w-3.5" />
          Reload
        </Button>
      </div>
    </div>
  );
}
