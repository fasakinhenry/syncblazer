import { Link } from "react-router-dom";
import { DownloadSimple } from "@phosphor-icons/react";
import { useDesktopDownload } from "@/hooks/useDesktopDownload.ts";
import { Button } from "@/components/ui/Button.tsx";

/** Only renders on a platform the desktop app actually targets (Windows/Mac/
 * Linux) — on phones this would just be dead weight. Clicking it starts the
 * download immediately (a direct link to the matching installer, resolved
 * from GitHub's releases API) rather than sending anyone to the releases
 * page to figure out which of nine files is theirs. */
export function DesktopDownloadButton({ size = "sm", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const { label, relevant, url, loading } = useDesktopDownload();
  if (!relevant) return null;

  if (loading || !url) {
    return (
      <Button variant="secondary" size={size} disabled={loading} className={`gap-1.5 ${className}`}>
        <DownloadSimple className="h-4 w-4" />
        {loading ? "Checking for the latest build…" : `${label} — unavailable`}
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <a href={url} download>
        <Button variant="secondary" size={size} className={`gap-1.5 ${className}`}>
          <DownloadSimple className="h-4 w-4" />
          {label}
        </Button>
      </a>
      <Link to="/downloads" className="text-xs font-medium text-text-secondary hover:text-text-primary">
        Other platforms →
      </Link>
    </span>
  );
}
