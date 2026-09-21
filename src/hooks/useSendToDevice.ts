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
  const { toast, updateToast } = useToast();
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const send = async (targetDeviceId: string, targetDeviceName: string, file: File) => {
    const currentDevice = getCurrentDevice();
    if (!currentDevice || !roomId) {
      toast("Still setting up your workspace, give it a second and try again.", "info");
      return;
    }

    setSendingTo(targetDeviceId);
    const kind = file.type.startsWith("image/") ? "image" : "file";
    const toastId = toast(`Sending "${file.name}"… 0%`, "info");
    let lastToastPercent = 0;
    const onProgress = (sentBytes: number, totalBytes: number) => {
      const percent = totalBytes > 0 ? Math.round((sentBytes / totalBytes) * 100) : 0;
      if (percent >= lastToastPercent + 5 || percent === 100) {
        lastToastPercent = percent;
        updateToast(toastId, `Sending "${file.name}"… ${percent}%`, "info");
      }
    };

    try {
      const p2p = await sendFileP2P(targetDeviceId, file, kind, onProgress);

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
        updateToast(toastId, `Sent "${file.name}" to ${targetDeviceName}`, "success");
        return;
      }

      lastToastPercent = 0;
      updateToast(toastId, `Direct connection unavailable — sending "${file.name}" via cloud instead… 0%`, "info");
      const uploaded = await api.uploads.uploadWithProgress(file, (percent) => {
        if (percent >= lastToastPercent + 5 || percent === 100) {
          lastToastPercent = percent;
          updateToast(toastId, `Sending "${file.name}"… ${percent}%`, "info");
        }
      });
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
      updateToast(toastId, `Sent "${file.name}" to ${targetDeviceName}`, "success");
    } catch {
      updateToast(toastId, `Couldn't send "${file.name}". Please try again.`, "error");
    } finally {
      setSendingTo(null);
    }
  };

  /** Same as send, one file after another — a single P2P data channel
   * per device can't usefully carry more than one file at a time, so a
   * multi-file pick (e.g. an <input multiple>) is sent sequentially
   * rather than in parallel. A failed file doesn't stop the rest. */
  const sendMultiple = async (targetDeviceId: string, targetDeviceName: string, files: File[]) => {
    for (const file of files) {
      await send(targetDeviceId, targetDeviceName, file);
    }
  };

  return { send, sendMultiple, sendingTo };
}
