import { useState } from "react";
import { DownloadSimple, File as FileIcon, Image as ImageIcon, Link as LinkIcon, TextAa, X } from "@phosphor-icons/react";
import { useLocalSession } from "@/context/LocalSessionContext.tsx";
import { formatBytes } from "@/lib/format.ts";
import type { LocalTransferKind } from "@/lib/webrtc/LocalPeerConnection.ts";
import { ConfettiBurst } from "@/components/ConfettiBurst.tsx";

const KIND_ICON: Record<LocalTransferKind, typeof FileIcon> = {
  file: FileIcon,
  image: ImageIcon,
  text: TextAa,
  link: LinkIcon,
};

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function LocalIncomingTransfers() {
  const { incomingTransfers, dismissIncoming } = useLocalSession();
  const [celebrate, setCelebrate] = useState(false);
  if (incomingTransfers.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex w-full max-w-xs flex-col gap-2 md:bottom-6">
      <ConfettiBurst active={celebrate} onComplete={() => setCelebrate(false)} />
      {incomingTransfers.map((t) => {
        const Icon = KIND_ICON[t.meta.kind];
        const percent = t.meta.size > 0 ? Math.round((t.bytesTransferred / t.meta.size) * 100) : 100;
        return (
          <div key={t.id} className="rounded-xl border border-border bg-surface p-4 shadow-lg">
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{t.meta.name}</p>
                <p className="text-xs text-text-secondary">
                  From {t.fromPeerName} · {t.status === "completed" ? "Received" : `${percent}%`}
                  {t.meta.size > 0 ? ` · ${formatBytes(t.meta.size)}` : ""}
                </p>
              </div>
              <button onClick={() => dismissIncoming(t.id)} aria-label="Dismiss" className="shrink-0 rounded-md p-1 text-text-secondary hover:bg-surface-hover">
                <X className="h-4 w-4" />
              </button>
            </div>

            {t.status === "receiving" && (t.meta.kind === "file" || t.meta.kind === "image") && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-hover">
                <div className="h-full bg-brand transition-all" style={{ width: `${percent}%` }} />
              </div>
            )}

            {t.status === "completed" && t.blob && (
              <button
                onClick={() => {
                  downloadBlob(t.blob!, t.meta.name);
                  setCelebrate(true);
                }}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand py-2 text-sm font-medium text-white hover:bg-brand-hover"
              >
                <DownloadSimple className="h-4 w-4" />
                Save file
              </button>
            )}

            {t.status === "completed" && (t.meta.kind === "text" || t.meta.kind === "link") && (
              <button
                onClick={() => navigator.clipboard.writeText(t.meta.textContent ?? "")}
                className="mt-3 w-full rounded-lg border border-border py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
              >
                Copy
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
