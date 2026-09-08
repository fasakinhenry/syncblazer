import { useEffect, useRef } from "react";
import { useQuickPair } from "@/context/QuickPairContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
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

export function QuickPairIncomingTransfers() {
  const { incomingTransfers, dismissIncoming } = useQuickPair();
  const { toast } = useToast();
  const knownCompletedRef = useRef<Set<string>>(new Set());

  // A one-shot nudge the moment a transfer finishes, on top of the
  // persistent panel below — the panel is where you actually download from,
  // this is just so the moment isn't missed if it's collapsed.
  useEffect(() => {
    const completed = incomingTransfers.filter((t) => t.status === "completed");
    for (const t of completed) {
      if (!knownCompletedRef.current.has(t.id)) {
        toast(
          t.meta.kind === "text" || t.meta.kind === "link"
            ? `Received from ${t.fromPeerName}`
            : `"${t.meta.name}" received from ${t.fromPeerName}`,
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
    fromLabel: `From ${t.fromPeerName}`,
    textContent: t.meta.textContent,
  }));

  return (
    <TransferPanel
      items={items}
      onDismiss={dismissIncoming}
      onDownload={(item) => {
        const t = incomingTransfers.find((x) => x.id === item.id);
        if (t?.blob) downloadBlob(t.blob, t.meta.name);
      }}
      onCopy={(item) => void navigator.clipboard.writeText(item.textContent ?? "")}
    />
  );
}
