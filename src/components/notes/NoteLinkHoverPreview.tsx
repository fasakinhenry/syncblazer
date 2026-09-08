import { useEffect, useState } from "react";
import { LinkSimple } from "@phosphor-icons/react";
import { getLinkPreview, type LinkPreviewData } from "@/lib/linkPreviewCache.ts";

/** Floating preview card for a link hovered inside a note's body — reuses
 * the same cache LinkPreviewCards already populates below the note, so
 * hovering a link you've already seen previewed there is instant. */
export function NoteLinkHoverPreview({ url, x, y }: { url: string; x: number; y: number }) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    getLinkPreview(url).then((result) => {
      if (cancelled) return;
      setData(result);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // Leave hostname as the raw url — a malformed link still gets a preview attempt.
  }

  return (
    <div
      className="note-link-preview-popover fixed z-30 flex w-64 items-center gap-2.5 rounded-lg border border-border bg-surface p-2.5 shadow-lg"
      style={{ left: x, top: y }}
    >
      {data?.image ? (
        <img src={data.image} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-hover text-text-secondary">
          <LinkSimple className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{loaded ? data?.title || hostname : hostname}</p>
        <p className="truncate text-xs text-text-secondary">{hostname}</p>
      </div>
    </div>
  );
}
