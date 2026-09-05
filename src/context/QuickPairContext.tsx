import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSocket } from "@/context/SocketContext.tsx";
import { TrickleWebRTCPeer, type TrickleTransferMeta } from "@/lib/webrtc/TrickleWebRTCPeer.ts";

type SessionRole = "none" | "host" | "guest";

export interface QuickPairPeerInfo {
  id: string;
  name: string;
  status: "connecting" | "connected";
}

export interface QuickPairIncomingTransfer {
  id: string;
  meta: TrickleTransferMeta;
  fromPeerName: string;
  bytesTransferred: number;
  status: "receiving" | "completed";
  blob?: Blob;
}

interface QuickPairContextValue {
  role: SessionRole;
  myName: string;
  code: string | null;
  peers: QuickPairPeerInfo[];
  incomingTransfers: QuickPairIncomingTransfer[];
  connecting: boolean;
  error: string | null;

  startSession: (name: string) => Promise<void>;
  joinSession: (code: string, name: string) => Promise<void>;
  leaveSession: () => void;

  sendFile: (peerId: string | "all", file: File, kind: "file" | "image", onProgress?: (sent: number, total: number) => void) => Promise<void>;
  sendText: (peerId: string | "all", content: string, kind: "text" | "link", name: string) => Promise<void>;
  dismissIncoming: (id: string) => void;
}

const QuickPairContext = createContext<QuickPairContextValue | null>(null);

export function QuickPairProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket();

  const [role, setRole] = useState<SessionRole>("none");
  const [myName, setMyName] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [peers, setPeers] = useState<QuickPairPeerInfo[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<QuickPairIncomingTransfer[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeRef = useRef<string | null>(null);
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

  const sendSignalTo = useCallback(
    (targetPeerId: string) => (kind: "offer" | "answer" | "ice-candidate", data: unknown) => {
      if (!socket || !codeRef.current) return;
      socket.emit("quickpair:signal", { code: codeRef.current, targetPeerId, kind, data });
    },
    [socket]
  );

  // Global signal listener, one per socket — looks up (or lazily creates,
  // for an inbound offer from a peer we haven't started connecting to yet)
  // the right TrickleWebRTCPeer and forwards the signal to it. Same pattern
  // PeerTransferContext already uses for the account-based P2P path.
  useEffect(() => {
    if (!socket) return;

    const onSignal = ({ fromPeerId, kind, data }: { fromPeerId: string; kind: "offer" | "answer" | "ice-candidate"; data: unknown }) => {
      let conn = connectionsRef.current.get(fromPeerId);
      if (!conn) {
        const peerName = peers.find((p) => p.id === fromPeerId)?.name ?? "Unknown device";
        conn = new TrickleWebRTCPeer(sendSignalTo(fromPeerId), makeHandlers(fromPeerId, peerName));
        connectionsRef.current.set(fromPeerId, conn);
      }
      void conn.handleSignal(kind, data);
    };

    const onPeerJoined = ({ peerId, name }: { peerId: string; name: string }) => {
      setPeers((prev) => (prev.some((p) => p.id === peerId) ? prev : [...prev, { id: peerId, name, status: "connecting" }]));
      // Existing members wait for the newcomer's offer rather than racing to
      // both be initiators — the newcomer always initiates (see joinSession).
    };

    const onPeerLeft = ({ peerId }: { peerId: string }) => removePeer(peerId);

    socket.on("quickpair:signal", onSignal);
    socket.on("quickpair:peer-joined", onPeerJoined);
    socket.on("quickpair:peer-left", onPeerLeft);
    return () => {
      socket.off("quickpair:signal", onSignal);
      socket.off("quickpair:peer-joined", onPeerJoined);
      socket.off("quickpair:peer-left", onPeerLeft);
    };
  }, [socket, peers, sendSignalTo, makeHandlers, removePeer]);

  const startSession = useCallback(
    async (name: string) => {
      if (!socket) throw new Error("Not connected");
      setError(null);
      setConnecting(true);
      setMyName(name);
      try {
        const res = await new Promise<{ code: string }>((resolve) => {
          socket.emit("quickpair:create", { name }, resolve);
        });
        codeRef.current = res.code;
        setCode(res.code);
        setRole("host");
      } catch {
        setError("Couldn't start a session. Please try again.");
      } finally {
        setConnecting(false);
      }
    },
    [socket]
  );

  const joinSession = useCallback(
    async (inputCode: string, name: string) => {
      if (!socket) throw new Error("Not connected");
      setError(null);
      setConnecting(true);
      setMyName(name);
      try {
        const res = await new Promise<{ ok: true; peers: { peerId: string; name: string }[] } | { ok: false; error: string }>(
          (resolve) => socket.emit("quickpair:join", { code: inputCode, name }, resolve)
        );
        if (!res.ok) throw new Error(res.error);

        codeRef.current = inputCode;
        setCode(inputCode);
        setRole("guest");
        setPeers(res.peers.map((p) => ({ id: p.peerId, name: p.name, status: "connecting" as const })));

        // We're the newcomer — initiate a connection to every peer already there.
        await Promise.all(
          res.peers.map(async (p) => {
            const conn = new TrickleWebRTCPeer(sendSignalTo(p.peerId), makeHandlers(p.peerId, p.name));
            connectionsRef.current.set(p.peerId, conn);
            try {
              await conn.connect();
            } catch {
              setError(`Couldn't connect to ${p.name}.`);
            }
          })
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "That code didn't work.");
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [socket, sendSignalTo, makeHandlers]
  );

  const leaveSession = useCallback(() => {
    if (socket && codeRef.current) socket.emit("quickpair:leave", { code: codeRef.current });
    for (const conn of connectionsRef.current.values()) conn.close();
    connectionsRef.current.clear();
    codeRef.current = null;
    setRole("none");
    setCode(null);
    setPeers([]);
    setIncomingTransfers([]);
    setError(null);
  }, [socket]);

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

  const value = useMemo<QuickPairContextValue>(
    () => ({
      role,
      myName,
      code,
      peers,
      incomingTransfers,
      connecting,
      error,
      startSession,
      joinSession,
      leaveSession,
      sendFile,
      sendText,
      dismissIncoming,
    }),
    [role, myName, code, peers, incomingTransfers, connecting, error, startSession, joinSession, leaveSession, sendFile, sendText, dismissIncoming]
  );

  return <QuickPairContext.Provider value={value}>{children}</QuickPairContext.Provider>;
}

export function useQuickPair(): QuickPairContextValue {
  const ctx = useContext(QuickPairContext);
  if (!ctx) throw new Error("useQuickPair must be used within a QuickPairProvider");
  return ctx;
}
