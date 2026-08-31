import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PeerConnection, type TransferMeta } from "@/lib/webrtc/PeerConnection.ts";
import { useSocket } from "@/context/SocketContext.tsx";
import { getCurrentDevice } from "@/lib/deviceInfo.ts";

export interface IncomingTransfer {
  id: string;
  meta: TransferMeta;
  fromDeviceId: string;
  bytesTransferred: number;
  status: "receiving" | "completed" | "cancelled";
  blob?: Blob;
}

interface SendFileResult {
  ok: boolean;
  error?: string;
}

interface PeerTransferContextValue {
  incomingTransfers: IncomingTransfer[];
  sendFile: (
    targetDeviceId: string,
    file: File,
    kind: "file" | "image",
    onProgress?: (sent: number, total: number) => void
  ) => Promise<SendFileResult>;
  sendText: (targetDeviceId: string, content: string, kind: "text" | "link", name: string) => Promise<SendFileResult>;
  dismissIncoming: (id: string) => void;
}

const PeerTransferContext = createContext<PeerTransferContextValue | null>(null);

export function PeerTransferProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket();
  const connectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const [incomingTransfers, setIncomingTransfers] = useState<IncomingTransfer[]>([]);

  const getOrCreateConnection = useCallback(
    (targetDeviceId: string): PeerConnection => {
      const existing = connectionsRef.current.get(targetDeviceId);
      if (existing) return existing;

      const conn = new PeerConnection(socket!, targetDeviceId, {
        onIncomingMeta: (meta) => {
          setIncomingTransfers((prev) => [
            ...prev,
            { id: meta.id, meta, fromDeviceId: targetDeviceId, bytesTransferred: 0, status: "receiving" },
          ]);
        },
        onProgress: (id, bytesTransferred) => {
          setIncomingTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, bytesTransferred } : t)));
        },
        onFileComplete: (id, blob) => {
          setIncomingTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, blob, status: "completed" } : t)));
        },
        onTextComplete: (meta) => {
          setIncomingTransfers((prev) => [
            ...prev,
            { id: meta.id, meta, fromDeviceId: targetDeviceId, bytesTransferred: meta.size, status: "completed" },
          ]);
        },
        onClose: () => {
          connectionsRef.current.delete(targetDeviceId);
        },
      });
      connectionsRef.current.set(targetDeviceId, conn);
      return conn;
    },
    [socket]
  );

  useEffect(() => {
    if (!socket) return;

    const onSignal = (payload: { fromDeviceId: string; kind: "offer" | "answer" | "ice-candidate"; data: unknown }) => {
      const conn = getOrCreateConnection(payload.fromDeviceId);
      void conn.handleSignal(payload.kind, payload.data);
    };

    socket.on("signal:receive", onSignal);
    return () => {
      socket.off("signal:receive", onSignal);
    };
  }, [socket, getOrCreateConnection]);

  useEffect(() => {
    const connections = connectionsRef.current;
    return () => {
      connections.forEach((conn) => conn.close());
      connections.clear();
    };
  }, []);

  const sendFile = useCallback(
    async (
      targetDeviceId: string,
      file: File,
      kind: "file" | "image",
      onProgress?: (sent: number, total: number) => void
    ): Promise<SendFileResult> => {
      if (!socket) return { ok: false, error: "Not connected" };
      const conn = getOrCreateConnection(targetDeviceId);
      try {
        await conn.connect();
        const id = crypto.randomUUID();
        await conn.sendFile(id, file, kind, onProgress);
        return { ok: true };
      } catch (err) {
        conn.close();
        connectionsRef.current.delete(targetDeviceId);
        return { ok: false, error: err instanceof Error ? err.message : "Direct transfer failed" };
      }
    },
    [socket, getOrCreateConnection]
  );

  const sendText = useCallback(
    async (targetDeviceId: string, content: string, kind: "text" | "link", name: string): Promise<SendFileResult> => {
      if (!socket) return { ok: false, error: "Not connected" };
      const conn = getOrCreateConnection(targetDeviceId);
      try {
        await conn.connect();
        const id = crypto.randomUUID();
        conn.sendText(id, content, kind, name);
        return { ok: true };
      } catch (err) {
        conn.close();
        connectionsRef.current.delete(targetDeviceId);
        return { ok: false, error: err instanceof Error ? err.message : "Direct transfer failed" };
      }
    },
    [socket, getOrCreateConnection]
  );

  const dismissIncoming = useCallback((id: string) => {
    setIncomingTransfers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<PeerTransferContextValue>(
    () => ({ incomingTransfers, sendFile, sendText, dismissIncoming }),
    [incomingTransfers, sendFile, sendText, dismissIncoming]
  );

  return <PeerTransferContext.Provider value={value}>{children}</PeerTransferContext.Provider>;
}

export function usePeerTransfer(): PeerTransferContextValue {
  const ctx = useContext(PeerTransferContext);
  if (!ctx) throw new Error("usePeerTransfer must be used within a PeerTransferProvider");
  return ctx;
}

/** True once the local device identity is known, so callers can gate P2P actions. */
export function hasCurrentDevice(): boolean {
  return !!getCurrentDevice();
}
