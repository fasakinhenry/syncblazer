import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { TrickleWebRTCPeer, type TrickleTransferMeta } from "@/lib/webrtc/TrickleWebRTCPeer.ts";
import { isTauri, getLanInfo } from "@/lib/tauri.ts";

type SessionRole = "none" | "host" | "guest";

export interface LanPairPeerInfo {
  id: string;
  name: string;
  status: "connecting" | "connected";
}

export interface LanPairIncomingTransfer {
  id: string;
  meta: TrickleTransferMeta;
  fromPeerName: string;
  bytesTransferred: number;
  status: "receiving" | "completed";
  blob?: Blob;
}

type ServerMessage =
  | { type: "joined"; peers: { peerId: string; name: string }[] }
  | { type: "peerJoined"; peerId: string; name: string }
  | { type: "peerLeft"; peerId: string }
  | { type: "signal"; fromPeerId: string; kind: "offer" | "answer" | "ice-candidate"; data: unknown };

interface LanPairContextValue {
  role: SessionRole;
  myName: string;
  qrUrl: string | null; // ws://<ip>:<port>/pair/<code> — only set while hosting
  peers: LanPairPeerInfo[];
  incomingTransfers: LanPairIncomingTransfer[];
  connecting: boolean;
  error: string | null;

  /** Desktop-app side only — requires isTauri(). */
  startHosting: (name: string) => Promise<void>;
  /** Browser side — call with the ws:// URL decoded from a scanned QR. */
  joinViaUrl: (wsUrl: string, name: string) => Promise<void>;
  leaveSession: () => void;

  sendFile: (peerId: string | "all", file: File, kind: "file" | "image", onProgress?: (sent: number, total: number) => void) => Promise<void>;
  sendText: (peerId: string | "all", content: string, kind: "text" | "link", name: string) => Promise<void>;
  dismissIncoming: (id: string) => void;
}

const LanPairContext = createContext<LanPairContextValue | null>(null);

function randomPeerId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function randomCode(): string {
  const digits = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join("");
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function LanPairProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<SessionRole>("none");
  const [myName, setMyName] = useState("");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [peers, setPeers] = useState<LanPairPeerInfo[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<LanPairIncomingTransfer[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myPeerIdRef = useRef(randomPeerId());
  const wsRef = useRef<WebSocket | null>(null);
  const connectionsRef = useRef<Map<string, TrickleWebRTCPeer>>(new Map());

  const addIncoming = useCallback((id: string, meta: TrickleTransferMeta, fromPeerName: string) => {
    setIncomingTransfers((prev) => [...prev, { id, meta, fromPeerName, bytesTransferred: 0, status: "receiving" }]);
  }, []);

  const removePeer = useCallback((peerId: string) => {
    connectionsRef.current.get(peerId)?.close();
    connectionsRef.current.delete(peerId);
    setPeers((prev) => prev.filter((p) => p.id !== peerId));
  }, []);

  const makeHandlers = useCallback(
    (peerId: string, peerName: string) => ({
      onIncomingMeta: (meta: TrickleTransferMeta) => {
        if (meta.kind !== "text" && meta.kind !== "link") addIncoming(meta.id, meta, peerName);
      },
      onProgress: (id: string, bytes: number) => {
        setIncomingTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, bytesTransferred: bytes } : t)));
      },
      onFileComplete: (id: string, blob: Blob) => {
        setIncomingTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, blob, status: "completed" as const } : t)));
      },
      onTextComplete: (meta: TrickleTransferMeta) => {
        addIncoming(meta.id, meta, peerName);
        setIncomingTransfers((prev) => prev.map((t) => (t.id === meta.id ? { ...t, status: "completed" as const } : t)));
      },
      onChannelOpen: () => {
        setPeers((prev) => prev.map((p) => (p.id === peerId ? { ...p, status: "connected" as const } : p)));
      },
      onClose: () => removePeer(peerId),
      onError: (message: string) => setError(message),
    }),
    [addIncoming, removePeer]
  );

  const sendRaw = useCallback((message: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, []);

  const sendSignalTo = useCallback(
    (code: string) => (targetPeerId: string) => (kind: "offer" | "answer" | "ice-candidate", data: unknown) => {
      sendRaw({ type: "signal", code, targetPeerId, kind, data });
    },
    [sendRaw]
  );

  const connect = useCallback(
    (wsUrl: string, code: string, name: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "join", code, peerId: myPeerIdRef.current, name }));
        };

        ws.onmessage = (event) => {
          let message: ServerMessage;
          try {
            message = JSON.parse(event.data as string);
          } catch {
            return;
          }

          if (message.type === "joined") {
            setPeers(message.peers.map((p) => ({ id: p.peerId, name: p.name, status: "connecting" as const })));
            // We're the newcomer — initiate a connection to everyone already there.
            for (const p of message.peers) {
              const conn = new TrickleWebRTCPeer(sendSignalTo(code)(p.peerId), makeHandlers(p.peerId, p.name));
              connectionsRef.current.set(p.peerId, conn);
              void conn.connect().catch(() => setError(`Couldn't connect to ${p.name}.`));
            }
            resolve();
          } else if (message.type === "peerJoined") {
            setPeers((prev) => (prev.some((p) => p.id === message.peerId) ? prev : [...prev, { id: message.peerId, name: message.name, status: "connecting" }]));
          } else if (message.type === "peerLeft") {
            removePeer(message.peerId);
          } else if (message.type === "signal") {
            let conn = connectionsRef.current.get(message.fromPeerId);
            if (!conn) {
              const peerName = peers.find((p) => p.id === message.fromPeerId)?.name ?? "Unknown device";
              conn = new TrickleWebRTCPeer(sendSignalTo(code)(message.fromPeerId), makeHandlers(message.fromPeerId, peerName));
              connectionsRef.current.set(message.fromPeerId, conn);
            }
            void conn.handleSignal(message.kind, message.data);
          }
        };

        ws.onerror = () => reject(new Error("Couldn't reach that device on the local network."));
        ws.onclose = () => setError((prev) => prev ?? "Lost the local connection.");
      });
    },
    [sendSignalTo, makeHandlers, removePeer, peers]
  );

  const startHosting = useCallback(
    async (name: string) => {
      if (!isTauri()) throw new Error("Hosting a LAN session requires the SyncBlaze desktop app.");
      setError(null);
      setConnecting(true);
      setMyName(name);
      try {
        const { ip, port } = await getLanInfo();
        const code = randomCode();
        const url = `ws://${ip}:${port}/pair/${code}`;
        setQrUrl(url);
        setRole("host");
        await connect(url, code, name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't start hosting.");
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [connect]
  );

  const joinViaUrl = useCallback(
    async (wsUrl: string, name: string) => {
      setError(null);
      setConnecting(true);
      setMyName(name);
      try {
        const code = wsUrl.split("/pair/")[1]?.split(/[?#]/)[0];
        if (!code) throw new Error("That code doesn't look right.");
        setRole("guest");
        await connect(wsUrl, code, name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't connect to that device.");
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [connect]
  );

  const leaveSession = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    for (const conn of connectionsRef.current.values()) conn.close();
    connectionsRef.current.clear();
    setRole("none");
    setQrUrl(null);
    setPeers([]);
    setIncomingTransfers([]);
    setError(null);
  }, []);

  const sendFile = useCallback(
    async (peerId: string | "all", file: File, kind: "file" | "image", onProgress?: (sent: number, total: number) => void) => {
      const targets = peerId === "all" ? [...connectionsRef.current.values()] : [connectionsRef.current.get(peerId)].filter((c): c is TrickleWebRTCPeer => !!c);
      if (targets.length === 0) throw new Error("Not connected");
      await Promise.all(targets.map((conn) => conn.sendFile(crypto.randomUUID(), file, kind, onProgress)));
    },
    []
  );

  const sendText = useCallback(async (peerId: string | "all", content: string, kind: "text" | "link", name: string) => {
    const targets = peerId === "all" ? [...connectionsRef.current.values()] : [connectionsRef.current.get(peerId)].filter((c): c is TrickleWebRTCPeer => !!c);
    if (targets.length === 0) throw new Error("Not connected");
    for (const conn of targets) conn.sendText(crypto.randomUUID(), content, kind, name);
  }, []);

  const dismissIncoming = useCallback((id: string) => {
    setIncomingTransfers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<LanPairContextValue>(
    () => ({
      role,
      myName,
      qrUrl,
      peers,
      incomingTransfers,
      connecting,
      error,
      startHosting,
      joinViaUrl,
      leaveSession,
      sendFile,
      sendText,
      dismissIncoming,
    }),
    [role, myName, qrUrl, peers, incomingTransfers, connecting, error, startHosting, joinViaUrl, leaveSession, sendFile, sendText, dismissIncoming]
  );

  return <LanPairContext.Provider value={value}>{children}</LanPairContext.Provider>;
}

export function useLanPair(): LanPairContextValue {
  const ctx = useContext(LanPairContext);
  if (!ctx) throw new Error("useLanPair must be used within a LanPairProvider");
  return ctx;
}
