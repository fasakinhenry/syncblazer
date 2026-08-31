import { useEffect, useState } from "react";
import { LinkSimple } from "@phosphor-icons/react";
import { extractUrls, getLinkPreview, type LinkPreviewData } from "@/lib/linkPreviewCache.ts";

export function LinkPreviewCards({ markdown }: { markdown: string }) {
  const urls = extractUrls(markdown);
  const [previews, setPreviews] = useState<Record<string, LinkPreviewData | null>>({});

  useEffect(() => {
    let cancelled = false;
    for (const url of urls) {
      if (url in previews) continue;
      getLinkPreview(url).then((data) => {
        if (!cancelled) setPreviews((prev) => ({ ...prev, [url]: data }));
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown]);

  const cards = urls.map((url) => previews[url]).filter((p): p is LinkPreviewData => !!p);
  if (cards.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Links in this note</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {cards.map((card) => (
          <a
            key={card.url}
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-surface-hover p-2 transition-colors hover:border-brand/40"
          >
            {card.image ? (
              <img src={card.image} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface text-text-secondary">
                <LinkSimple className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{card.title}</p>
              {card.description && <p className="truncate text-xs text-text-secondary">{card.description}</p>}
              <p className="truncate text-xs text-brand">{new URL(card.url).hostname}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
