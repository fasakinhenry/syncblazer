import { DownloadSimple } from "@phosphor-icons/react";
import { usePwaInstall } from "@/hooks/usePwaInstall.ts";
import { Button } from "@/components/ui/Button.tsx";
import { useToast } from "@/context/ToastContext.tsx";

export function InstallAppButton({
  className = "",
  size = "sm",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const { canInstall, promptInstall } = usePwaInstall();
  const { toast } = useToast();

  if (!canInstall) return null;

  const onClick = async () => {
    const accepted = await promptInstall();
    if (accepted) toast("Installing SyncBlaze…", "success");
  };

  return (
    <Button variant="secondary" size={size} onClick={onClick} className={`gap-1.5 ${className}`}>
      <DownloadSimple className="h-4 w-4" />
      Install app
    </Button>
  );
}
