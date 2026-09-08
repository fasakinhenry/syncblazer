import { useEffect, useState } from "react";
import { LinkSimple } from "@phosphor-icons/react";
import { getLinkPreview, type LinkPreviewData } from "@/lib/linkPreviewCache.ts";

export function ChatLinkPreview({ url }: { url: string }) {
  const [preview, setPreview] = useState<LinkPreviewData | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getLinkPreview(url).then((data) => {
      if (!cancelled) setPreview(data);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!preview) return null;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-surface p-1.5 transition-colors hover:border-brand/40"
    >
      {preview.image ? (
        <img src={preview.image} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface-hover text-text-secondary">
          <LinkSimple className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-text-primary">{preview.title}</span>
        <span className="block truncate text-[11px] text-brand">{new URL(preview.url).hostname}</span>
      </span>
    </a>
  );
}
