import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSocket } from "@/context/SocketContext.tsx";
import { TrickleWebRTCPeer, TransferInterruptedError, type TrickleTransferMeta } from "@/lib/webrtc/TrickleWebRTCPeer.ts";

type SessionRole = "none" | "host" | "guest";

export interface QuickPairPeerInfo {
  id: string;
  name: string;
  status: "connecting" | "connected" | "reconnecting";
}

export interface QuickPairIncomingTransfer {
  id: string;
  meta: TrickleTransferMeta;
  fromPeerName: string;
  bytesTransferred: number;
  status: "receiving" | "completed";
  blob?: Blob;
}

interface PendingSend {
  id: string;
  file: File;
  kind: "file" | "image";
  onProgress?: (sent: number, total: number) => void;
}

interface PendingReceive {
  id: string;
  meta: TrickleTransferMeta;
  chunks: ArrayBuffer[];
  bytesReceived: number;
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

// A dropped data channel gets a beat to settle (the network blip that
// killed it is usually still resolving) before the initiator re-dials —
// hammering an offer the instant the link dies just races the same blip.
const RECONNECT_DELAY_MS = 1000;
// How long a fresh channel waits for the other side's unsolicited
// resumeOffset before assuming it has no partial state and restarting the
// send from scratch.
const RESUME_HANDSHAKE_TIMEOUT_MS = 3000;

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
  // Peer ids we originally initiated the connection to (we called .connect()
  // for them). Only the original initiator re-dials on reconnect — the
  // other side just waits for a fresh inbound offer, exactly like the first
  // handshake, so both sides never race to create competing offers.
  const initiatorsRef = useRef<Set<string>>(new Set());
  const pendingSendsRef = useRef<Map<string, PendingSend>>(new Map());
  const pendingReceivesRef = useRef<Map<string, PendingReceive>>(new Map());
  const resumeOffsetResolversRef = useRef<Map<string, (bytesReceived: number | null) => void>>(new Map());
  const transferCompletionsRef = useRef<Map<string, { resolve: () => void; reject: (err: Error) => void }>>(new Map());

  const addIncoming = useCallback((id: string, meta: TrickleTransferMeta, fromPeerName: string) => {
    setIncomingTransfers((prev) => [...prev, { id, meta, fromPeerName, bytesTransferred: 0, status: "receiving" }]);
  }, []);

  const clearPeerTransferState = useCallback((peerId: string) => {
    const pendingSend = pendingSendsRef.current.get(peerId);
    if (pendingSend) {
      transferCompletionsRef.current.get(pendingSend.id)?.reject(new Error("That device left the session"));
      transferCompletionsRef.current.delete(pendingSend.id);
      pendingSendsRef.current.delete(peerId);
    }
    pendingReceivesRef.current.delete(peerId);
  }, []);

  /** The other side's socket/session connection itself dropped — they're
   * genuinely gone, not coming back. Full removal. */
  const removePeer = useCallback(
    (peerId: string) => {
      connectionsRef.current.get(peerId)?.close();
      connectionsRef.current.delete(peerId);
      initiatorsRef.current.delete(peerId);
      clearPeerTransferState(peerId);
      setPeers((prev) => prev.filter((p) => p.id !== peerId));
    },
    [clearPeerTransferState]
  );

  const sendSignalTo = useCallback(
    (targetPeerId: string) => (kind: "offer" | "answer" | "ice-candidate", data: unknown) => {
      if (!socket || !codeRef.current) return;
      socket.emit("quickpair:signal", { code: codeRef.current, targetPeerId, kind, data });
    },
    [socket]
  );

  // Run once a fresh channel to `peerId` opens: hand over anything we were
  // mid-receiving before the drop (so the sender can pick up where it left
  // off), and if we have a send of our own still pending, wait briefly for
  // the other side to tell us how much it already has before resuming (or
  // restarting, if it turns out it has nothing).
  const attemptSend = useCallback((peerId: string, pending: PendingSend, resumeFromOffset: number) => {
    const conn = connectionsRef.current.get(peerId);
    if (!conn) {
      // Mid-reconnect right now — stash it, the next successful channel open
      // will pick this back up via handleResumeOnOpen.
      pendingSendsRef.current.set(peerId, pending);
      return Promise.resolve();
    }
    return conn
      .sendFile(pending.id, pending.file, pending.kind, pending.onProgress, resumeFromOffset)
      .then(() => {
        transferCompletionsRef.current.get(pending.id)?.resolve();
        transferCompletionsRef.current.delete(pending.id);
      })
      .catch((err: unknown) => {
        if (err instanceof TransferInterruptedError) {
          pendingSendsRef.current.set(peerId, pending);
          return;
        }
        transferCompletionsRef.current.get(pending.id)?.reject(err instanceof Error ? err : new Error("Send failed"));
        transferCompletionsRef.current.delete(pending.id);
      });
  }, []);

  const handleResumeOnOpen = useCallback(
    (peerId: string) => {
      const conn = connectionsRef.current.get(peerId);
      if (!conn) return;

      const pendingReceive = pendingReceivesRef.current.get(peerId);
      if (pendingReceive) {
        pendingReceivesRef.current.delete(peerId);
        conn.primeResumedReceive(pendingReceive.meta, pendingReceive.chunks, pendingReceive.bytesReceived);
        conn.sendResumeOffset(pendingReceive.id, pendingReceive.bytesReceived);
      }

      const pendingSend = pendingSendsRef.current.get(peerId);
      if (pendingSend) {
        pendingSendsRef.current.delete(peerId);
        const waitForResumeOffset = new Promise<number | null>((resolve) => {
          resumeOffsetResolversRef.current.set(pendingSend.id, resolve);
          setTimeout(() => {
            if (resumeOffsetResolversRef.current.has(pendingSend.id)) {
              resumeOffsetResolversRef.current.delete(pendingSend.id);
              resolve(null);
            }
          }, RESUME_HANDSHAKE_TIMEOUT_MS);
        });
        void waitForResumeOffset.then((resumeOffset) => {
          void attemptSend(peerId, pendingSend, resumeOffset ?? 0);
        });
      }
    },
    [attemptSend]
  );

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
        handleResumeOnOpen(peerId);
      },
      onReceiveInterrupted: (meta: TrickleTransferMeta, chunks: ArrayBuffer[], bytesReceived: number) => {
        pendingReceivesRef.current.set(peerId, { id: meta.id, meta, chunks, bytesReceived });
      },
      onResumeOffsetReceived: (id: string, bytesReceived: number) => {
        const resolve = resumeOffsetResolversRef.current.get(id);
        if (resolve) {
          resumeOffsetResolversRef.current.delete(id);
          resolve(bytesReceived);
        }
      },
      onClose: () => {
        // The P2P link broke, but the peer might still be in the session
        // (their socket is still connected) — the server's own peerLeft
        // signal is what means they're actually gone. Keep them in the
        // roster as "reconnecting" and, if we were the original initiator,
        // re-dial after a short grace delay.
        connectionsRef.current.delete(peerId);
        setPeers((prev) => prev.map((p) => (p.id === peerId ? { ...p, status: "reconnecting" as const } : p)));

        if (initiatorsRef.current.has(peerId)) {
          setTimeout(() => {
            // The peer may have fully left (server-side peerLeft already
            // removed them) or we may have left the session entirely by the
            // time this fires — both clear initiatorsRef, so re-check first.
            if (!initiatorsRef.current.has(peerId)) return;
            const freshConn = new TrickleWebRTCPeer(sendSignalTo(peerId), makeHandlers(peerId, peerName));
            connectionsRef.current.set(peerId, freshConn);
            freshConn.connect().catch(() => setError(`Couldn't reconnect to ${peerName}.`));
          }, RECONNECT_DELAY_MS);
        }
      },
      onError: (message: string) => setError(message),
    }),
    [addIncoming, handleResumeOnOpen, sendSignalTo]
  );

  // Global signal listener, one per socket — looks up (or lazily creates,
  // for an inbound offer from a peer we haven't started connecting to yet,
  // including a fresh offer from a reconnecting initiator) the right
  // TrickleWebRTCPeer and forwards the signal to it. Same pattern
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
            initiatorsRef.current.add(p.peerId);
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
    initiatorsRef.current.clear();
    pendingSendsRef.current.clear();
    pendingReceivesRef.current.clear();
    resumeOffsetResolversRef.current.clear();
    transferCompletionsRef.current.clear();
    codeRef.current = null;
    setRole("none");
    setCode(null);
    setPeers([]);
    setIncomingTransfers([]);
    setError(null);
  }, [socket]);

  const sendFile = useCallback(
    (peerId: string | "all", file: File, kind: "file" | "image", onProgress?: (sent: number, total: number) => void) => {
      const targetIds = peerId === "all" ? peers.map((p) => p.id) : peers.some((p) => p.id === peerId) ? [peerId] : [];
      if (targetIds.length === 0) return Promise.reject(new Error("Not connected"));

      return Promise.all(
        targetIds.map(
          (pid) =>
            new Promise<void>((resolve, reject) => {
              const id = crypto.randomUUID();
              transferCompletionsRef.current.set(id, { resolve, reject });
              void attemptSend(pid, { id, file, kind, onProgress }, 0);
            })
        )
      ).then(() => undefined);
    },
    [peers, attemptSend]
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
