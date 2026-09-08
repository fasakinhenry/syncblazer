import { useEffect, useRef } from "react";
import { usePeerTransfer } from "@/context/PeerTransferContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { api } from "@/lib/api.ts";
import { TransferPanel, type TransferPanelItem } from "@/components/transfers/TransferPanel.tsx";

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

export function IncomingTransfers() {
  const { incomingTransfers, dismissIncoming } = usePeerTransfer();
  const { toast } = useToast();
  const knownCompletedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const completed = incomingTransfers.filter((t) => t.status === "completed");
    for (const t of completed) {
      if (!knownCompletedRef.current.has(t.id)) {
        toast(
          t.meta.kind === "text" || t.meta.kind === "link" ? "Received a new transfer" : `"${t.meta.name}" received`,
          "success"
        );
      }
    }
    knownCompletedRef.current = new Set(completed.map((t) => t.id));
  }, [incomingTransfers, toast]);

  const items: TransferPanelItem[] = incomingTransfers.map((t) => ({
    id: t.id,
    name: t.meta.name,
    size: t.meta.size,
    kind: t.meta.kind,
    status: t.status,
    percent: t.meta.size > 0 ? Math.round((t.bytesTransferred / t.meta.size) * 100) : 100,
    fromLabel: "",
    textContent: t.meta.textContent,
  }));

  return (
    <TransferPanel
      items={items}
      onDismiss={dismissIncoming}
      onDownload={async (item) => {
        const t = incomingTransfers.find((x) => x.id === item.id);
        if (!t) return;
        if (t.blob) {
          downloadBlob(t.blob, t.meta.name);
          return;
        }
        try {
          const blob = await api.uploads.download(t.id);
          downloadBlob(blob, t.meta.name);
        } catch {
          toast("Couldn't download this file. Please try again.", "error");
        }
      }}
      onCopy={(item) => void navigator.clipboard.writeText(item.textContent ?? "")}
    />
  );
}
