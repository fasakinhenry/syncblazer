import { useState } from "react";
import { usePeerTransfer } from "@/context/PeerTransferContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { api } from "@/lib/api.ts";
import { getCurrentDevice } from "@/lib/deviceInfo.ts";

interface SendOptions {
  /** 0-100, reported for whichever path (P2P, then cloud fallback if that
   * fails) actually ends up carrying the file. */
  onProgress?: (percent: number) => void;
  /** "connecting" fires once, right before the P2P handshake attempt
   * (which can take up to ~15s to time out if the device isn't reachable
   * directly) — without it, a caller has no way to distinguish "about to
   * try a direct connection" from "silently stuck", since no byte-progress
   * exists yet either way. "transferring" fires once real bytes start
   * moving, over either path. */
  onPhase?: (phase: "connecting" | "transferring") => void;
  /** Suppresses the built-in toast lifecycle — for a caller (e.g. a room's
   * own "Sending" panel) that renders its own per-file progress instead.
   * Also switches failures from swallowed-and-toasted to rethrown, so a
   * caller managing its own batch state can mark that one file as failed. */
  silent?: boolean;
  /** Skip the P2P attempt entirely and go straight to the cloud relay.
   * Meant for a multi-file batch: once one file in it has already shown
   * this device isn't directly reachable, retrying P2P for every
   * remaining file would each separately pay the ~15s connection timeout
   * before falling back — the caller instead sets this after the first
   * fallback so the rest of the batch skips straight to cloud. */
  skipP2P?: boolean;
}

/** Sends a file directly (P2P) to a device, falling back to the cloud
 * relay if a direct connection can't be established, and records the
 * result as a real Transfer either way so history stays accurate.
 * Resolves with which path actually carried the file. */
export function useSendToDevice(roomId: string | undefined) {
  const { sendFile: sendFileP2P } = usePeerTransfer();
  const { toast, updateToast } = useToast();
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const send = async (
    targetDeviceId: string,
    targetDeviceName: string,
    file: File,
    options?: SendOptions
  ): Promise<"local" | "cloud" | undefined> => {
    const silent = options?.silent ?? false;
    const currentDevice = getCurrentDevice();
    if (!currentDevice || !roomId) {
      if (silent) throw new Error("Not ready to send yet");
      toast("Still setting up your workspace, give it a second and try again.", "info");
      return undefined;
    }

    setSendingTo(targetDeviceId);
    const kind = file.type.startsWith("image/") ? "image" : "file";
    const toastId = silent ? null : toast(`Sending "${file.name}"… 0%`, "info");
    let lastToastPercent = 0;
    const reportProgress = (percent: number) => {
      options?.onProgress?.(percent);
      if (toastId !== null && (percent >= lastToastPercent + 5 || percent === 100)) {
        lastToastPercent = percent;
        updateToast(toastId, `Sending "${file.name}"… ${percent}%`, "info");
      }
    };
    const onProgress = (sentBytes: number, totalBytes: number) => {
      options?.onPhase?.("transferring");
      reportProgress(totalBytes > 0 ? Math.round((sentBytes / totalBytes) * 100) : 0);
    };

    try {
      if (!options?.skipP2P) {
        options?.onPhase?.("connecting");
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
          if (toastId !== null) updateToast(toastId, `Sent "${file.name}" to ${targetDeviceName}`, "success");
          return "local";
        }

        lastToastPercent = 0;
        if (toastId !== null) updateToast(toastId, `Direct connection unavailable — sending "${file.name}" via cloud instead… 0%`, "info");
      }

      options?.onPhase?.("transferring");
      const uploaded = await api.uploads.uploadWithProgress(file, reportProgress);
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
      if (toastId !== null) updateToast(toastId, `Sent "${file.name}" to ${targetDeviceName}`, "success");
      return "cloud";
    } catch (err) {
      if (toastId !== null) updateToast(toastId, `Couldn't send "${file.name}". Please try again.`, "error");
      if (silent) throw err;
      return undefined;
    } finally {
      setSendingTo(null);
    }
  };

  /** Same as send, one file after another — a single P2P data channel
   * per device can't usefully carry more than one file at a time, so a
   * multi-file pick (e.g. an <input multiple>) is sent sequentially
   * rather than in parallel. A failed file doesn't stop the rest. Skips
   * re-attempting P2P for the rest of the batch once one file has shown
   * it isn't reachable, so a multi-file send doesn't pay the connection
   * timeout over and over. */
  const sendMultiple = async (targetDeviceId: string, targetDeviceName: string, files: File[]) => {
    let skipP2P = false;
    for (const file of files) {
      const method = await send(targetDeviceId, targetDeviceName, file, { skipP2P });
      if (method === "cloud") skipP2P = true;
    }
  };

  return { send, sendMultiple, sendingTo };
}
