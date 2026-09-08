import { useEffect, useRef, useState } from "react";
import {
  CaretRight,
  Check,
  Copy as CopyIcon,
  DownloadSimple,
  File as FileIcon,
  Image as ImageIcon,
  Link as LinkIcon,
  TextAa,
  Tray,
  X,
} from "@phosphor-icons/react";
import { formatBytes } from "@/lib/format.ts";
import { Spinner } from "@/components/ui/Spinner.tsx";
import { ConfettiBurst } from "@/components/ConfettiBurst.tsx";

export type TransferPanelKind = "file" | "image" | "text" | "link";

export interface TransferPanelItem {
  id: string;
  name: string;
  size: number;
  kind: TransferPanelKind;
  status: "receiving" | "completed" | "cancelled";
  percent: number;
  fromLabel: string;
  textContent?: string;
}

interface TransferPanelProps {
  items: TransferPanelItem[];
  onDownload: (item: TransferPanelItem) => Promise<void> | void;
  onCopy?: (item: TransferPanelItem) => void;
  onDismiss: (id: string) => void;
}

const KIND_ICON: Record<TransferPanelKind, typeof FileIcon> = {
  file: FileIcon,
  image: ImageIcon,
  text: TextAa,
  link: LinkIcon,
};

/** A persistent, always-reachable panel for in-flight/completed transfers —
 * replaces the old bottom-right toast-stack pattern (easy to miss, no
 * click-feedback) with something that stays put until dismissed and gives
 * a real confirmation once a download actually happens. Collapses to a
 * small badge tab rather than disappearing, and re-expands itself the
 * moment a new transfer shows up so it's never silently missed. */
export function TransferPanel({ items, onDownload, onCopy, onDismiss }: TransferPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [celebrate, setCelebrate] = useState(false);
  const knownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const ids = items.map((i) => i.id);
    const hasNew = ids.some((id) => !knownIdsRef.current.has(id));
    if (hasNew) setCollapsed(false);
    knownIdsRef.current = new Set(ids);
  }, [items]);

  if (items.length === 0) return null;

  const handleDownload = async (item: TransferPanelItem) => {
    setDownloadingId(item.id);
    try {
      await onDownload(item);
      setDownloadedIds((prev) => new Set(prev).add(item.id));
      setCelebrate(true);
      setTimeout(() => {
        setDownloadedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }, 3000);
    } finally {
      setDownloadingId(null);
    }
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        aria-label="Show transfers"
        className="fixed bottom-20 right-4 z-50 flex items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-brand-hover md:bottom-6"
      >
        <Tray className="h-4 w-4" />
        {items.length}
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 flex w-full max-w-xs flex-col gap-2 md:bottom-6">
      <ConfettiBurst active={celebrate} onComplete={() => setCelebrate(false)} />
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-text-secondary">Transfers</span>
        <button
          onClick={() => setCollapsed(true)}
          aria-label="Collapse transfers panel"
          className="rounded-md p-1 text-text-secondary hover:bg-surface-hover"
        >
          <CaretRight className="h-4 w-4" />
        </button>
      </div>
      <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind];
          const isDownloading = downloadingId === item.id;
          const justDownloaded = downloadedIds.has(item.id);
          return (
            <div key={item.id} className="rounded-xl border border-border bg-surface p-4 shadow-lg">
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{item.name}</p>
                  {item.kind === "file" || item.kind === "image" ? (
                    <p className="text-xs text-text-secondary">
                      {[
                        item.fromLabel,
                        item.status === "completed" ? "Received" : item.status === "cancelled" ? "Cancelled" : `${item.percent}%`,
                        item.size > 0 ? formatBytes(item.size) : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : (
                    <>
                      {item.fromLabel && <p className="text-xs text-text-secondary">{item.fromLabel}</p>}
                      <p className="mt-1 line-clamp-3 break-words text-xs text-text-secondary">{item.textContent}</p>
                    </>
                  )}
                </div>
                <button
                  onClick={() => onDismiss(item.id)}
                  aria-label="Dismiss"
                  className="shrink-0 rounded-md p-1 text-text-secondary hover:bg-surface-hover"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {item.status === "receiving" && (item.kind === "file" || item.kind === "image") && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-hover">
                  <div className="h-full bg-brand transition-all" style={{ width: `${item.percent}%` }} />
                </div>
              )}

              {item.status === "completed" && (item.kind === "file" || item.kind === "image") && (
                <button
                  onClick={() => handleDownload(item)}
                  disabled={isDownloading}
                  className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                    justDownloaded ? "bg-success/15 text-success" : "bg-brand text-white hover:bg-brand-hover"
                  }`}
                >
                  {isDownloading ? (
                    <Spinner className="h-4 w-4 border-white/40 border-t-white" />
                  ) : justDownloaded ? (
                    <Check className="h-4 w-4" weight="bold" />
                  ) : (
                    <DownloadSimple className="h-4 w-4" />
                  )}
                  {isDownloading ? "Downloading…" : justDownloaded ? "Downloaded" : "Download file"}
                </button>
              )}

              {item.status === "completed" && (item.kind === "text" || item.kind === "link") && (
                <button
                  onClick={() => onCopy?.(item)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
                >
                  <CopyIcon className="h-4 w-4" />
                  Copy
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
