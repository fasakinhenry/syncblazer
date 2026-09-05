import { DownloadSimple } from "@phosphor-icons/react";
import { desktopDownloadInfo } from "@/lib/desktopApp.ts";
import { Button } from "@/components/ui/Button.tsx";

/** Only renders on a platform the desktop app actually targets (Windows/Mac/
 * Linux) — on phones this would just be dead weight. Links to nothing and
 * shows "Coming soon" if VITE_DESKTOP_DOWNLOAD_URL hasn't been set yet,
 * rather than a broken link. */
export function DesktopDownloadButton({ size = "sm", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const { label, relevant, url } = desktopDownloadInfo();
  if (!relevant) return null;

  if (!url) {
    return (
      <Button variant="secondary" size={size} disabled className={`gap-1.5 ${className}`}>
        <DownloadSimple className="h-4 w-4" />
        {label} — coming soon
      </Button>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer">
      <Button variant="secondary" size={size} className={`gap-1.5 ${className}`}>
        <DownloadSimple className="h-4 w-4" />
        {label}
      </Button>
    </a>
  );
}
