import { useState } from "react";
import { usePeerTransfer } from "@/context/PeerTransferContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { api } from "@/lib/api.ts";
import { getCurrentDevice } from "@/lib/deviceInfo.ts";

/** Sends a file directly (P2P) to a device, falling back to the cloud
 * relay if a direct connection can't be established, and records the
 * result as a real Transfer either way so history stays accurate. */
export function useSendToDevice(roomId: string | undefined) {
  const { sendFile: sendFileP2P } = usePeerTransfer();
  const { toast } = useToast();
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const send = async (targetDeviceId: string, targetDeviceName: string, file: File) => {
    const currentDevice = getCurrentDevice();
    if (!currentDevice || !roomId) return;

    setSendingTo(targetDeviceId);
    const kind = file.type.startsWith("image/") ? "image" : "file";

    try {
      const p2p = await sendFileP2P(targetDeviceId, file, kind);

      if (p2p.ok) {
        const { transfer } = await api.transfers.create({
          roomId,
          senderDeviceId: currentDevice._id,
          receiverDeviceId: targetDeviceId,
          type: kind,
          name: file.name,
          size: file.size,
          mimeType: file.type,
          transferMethod: "local",
        });
        await api.transfers.updateStatus(transfer._id, { status: "completed", progress: 100 });
        toast(`Blazed "${file.name}" directly to ${targetDeviceName}`, "success");
        return;
      }

      toast(`Direct connection unavailable, sending "${file.name}" via cloud instead`, "info");
      const uploaded = await api.uploads.uploadWithProgress(file, () => {});
      const { transfer } = await api.transfers.create({
        roomId,
        senderDeviceId: currentDevice._id,
        receiverDeviceId: targetDeviceId,
        type: kind,
        name: file.name,
        size: uploaded.size,
        mimeType: uploaded.mimeType,
        storageKey: uploaded.key,
        transferMethod: "cloud",
      });
      await api.transfers.updateStatus(transfer._id, { status: "completed", progress: 100 });
      toast(`Blazed "${file.name}" to ${targetDeviceName}`, "success");
    } catch {
      toast(`Couldn't send "${file.name}". Please try again.`, "error");
    } finally {
      setSendingTo(null);
    }
  };

  return { send, sendingTo };
}
