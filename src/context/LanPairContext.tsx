import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { TrickleWebRTCPeer, TransferInterruptedError, type TrickleTransferMeta } from "@/lib/webrtc/TrickleWebRTCPeer.ts";
import { isTauri, getLanInfo } from "@/lib/tauri.ts";

type SessionRole = "none" | "host" | "guest";

export interface LanPairPeerInfo {
  id: string;
  name: string;
  status: "connecting" | "connected" | "reconnecting";
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

export interface LanConnectionInfo {
  label: string; // hostname — the host's own when hosting, the remote host's when joining
  ip: string;
  port: number;
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

interface LanPairContextValue {
  role: SessionRole;
  myName: string;
  qrUrl: string | null; // ws://<ip>:<port>/pair/<code>?host=<name> — only set while hosting
  connectionInfo: LanConnectionInfo | null;
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

// A dropped data channel gets a beat to settle before the initiator re-dials
// — hammering an offer the instant the link dies just races the same blip
// that likely caused it (see TrickleWebRTCPeer.ts's disconnect grace period).
const RECONNECT_DELAY_MS = 1000;
// How long a fresh channel waits for the other side's unsolicited
// resumeOffset before assuming it has no partial state and restarting the
// send from scratch.
const RESUME_HANDSHAKE_TIMEOUT_MS = 3000;

export function LanPairProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<SessionRole>("none");
  const [myName, setMyName] = useState("");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<LanConnectionInfo | null>(null);
  const [peers, setPeers] = useState<LanPairPeerInfo[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<LanPairIncomingTransfer[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myPeerIdRef = useRef(randomPeerId());
  const wsRef = useRef<WebSocket | null>(null);
  const codeRef = useRef<string | null>(null);
  const connectionsRef = useRef<Map<string, TrickleWebRTCPeer>>(new Map());
  // Peer ids we originally initiated the connection to — only the original
  // initiator re-dials on reconnect (see QuickPairContext.tsx, same pattern).
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

  /** The peer's WebSocket signaling connection to the relay itself dropped —
   * they're genuinely gone, not coming back. Full removal. */
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
        // The P2P link broke, but the peer's WebSocket signaling connection
        // to the relay might still be alive — the relay's own peerLeft
        // message is what means they're actually gone. Keep them in the
        // roster as "reconnecting" and, if we were the original initiator,
        // re-dial after a short grace delay.
        connectionsRef.current.delete(peerId);
        setPeers((prev) => prev.map((p) => (p.id === peerId ? { ...p, status: "reconnecting" as const } : p)));

        const code = codeRef.current;
        if (initiatorsRef.current.has(peerId) && code) {
          setTimeout(() => {
            // The peer may have fully left, or we may have left the session
            // entirely, by the time this fires — both clear initiatorsRef.
            if (!initiatorsRef.current.has(peerId)) return;
            const freshConn = new TrickleWebRTCPeer(sendSignalTo(code)(peerId), makeHandlers(peerId, peerName));
            connectionsRef.current.set(peerId, freshConn);
            freshConn.connect().catch(() => setError(`Couldn't reconnect to ${peerName}.`));
          }, RECONNECT_DELAY_MS);
        }
      },
      onError: (message: string) => setError(message),
    }),
    [addIncoming, handleResumeOnOpen, sendSignalTo]
  );

  const connect = useCallback(
    (wsUrl: string, code: string, name: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        codeRef.current = code;

        // A socket that never opens and never errors (some firewall/network
        // configs just silently drop the connection attempt) used to hang
        // this promise — and the UI — forever with no feedback at all.
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("Couldn't reach that device — check you're both on the same Wi-Fi/hotspot."));
        }, 15000);
        const clearConnectTimeout = () => clearTimeout(timeout);

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
            clearConnectTimeout();
            setPeers(message.peers.map((p) => ({ id: p.peerId, name: p.name, status: "connecting" as const })));
            // We're the newcomer — initiate a connection to everyone already there.
            for (const p of message.peers) {
              initiatorsRef.current.add(p.peerId);
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

        ws.onerror = () => {
          clearConnectTimeout();
          reject(new Error("Couldn't reach that device on the local network."));
        };
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
        const { ip, port, hostname } = await getLanInfo();
        const code = randomCode();
        // The QR code needs the real LAN-facing IP — that's what the phone
        // will actually reach. But THIS device connecting to itself via
        // that same LAN IP is unreliable (Windows doesn't always loop
        // traffic back to your own external-facing address the way it does
        // for the loopback address) — use 127.0.0.1 for our own join so it
        // isn't at the mercy of that.
        //
        // The hostname rides along as a query param purely so the scanning
        // device can show "Connecting to Henry's Laptop" instead of a bare
        // IP — it's cosmetic, the relay itself ignores it entirely.
        setQrUrl(`ws://${ip}:${port}/pair/${code}?host=${encodeURIComponent(hostname)}`);
        setConnectionInfo({ label: hostname, ip, port });
        setRole("host");
        await connect(`ws://127.0.0.1:${port}/pair/${code}`, code, name);
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

        // Pull the host's IP/port/name out of the scanned URL for display —
        // "Connecting to Henry's Laptop at 192.168.1.42" reads a lot more
        // convincing than a bare pairing code ever could.
        try {
          const parsed = new URL(wsUrl.replace(/^ws/, "http"));
          setConnectionInfo({
            label: parsed.searchParams.get("host") || parsed.hostname,
            ip: parsed.hostname,
            port: Number(parsed.port) || 0,
          });
        } catch {
          // Cosmetic only — a malformed URL here still isn't fatal to pairing.
        }

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
    codeRef.current = null;
    for (const conn of connectionsRef.current.values()) conn.close();
    connectionsRef.current.clear();
    initiatorsRef.current.clear();
    pendingSendsRef.current.clear();
    pendingReceivesRef.current.clear();
    resumeOffsetResolversRef.current.clear();
    transferCompletionsRef.current.clear();
    setRole("none");
    setQrUrl(null);
    setConnectionInfo(null);
    setPeers([]);
    setIncomingTransfers([]);
    setError(null);
  }, []);

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

  const value = useMemo<LanPairContextValue>(
    () => ({
      role,
      myName,
      qrUrl,
      connectionInfo,
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
    [role, myName, qrUrl, connectionInfo, peers, incomingTransfers, connecting, error, startHosting, joinViaUrl, leaveSession, sendFile, sendText, dismissIncoming]
  );

  return <LanPairContext.Provider value={value}>{children}</LanPairContext.Provider>;
}

export function useLanPair(): LanPairContextValue {
  const ctx = useContext(LanPairContext);
  if (!ctx) throw new Error("useLanPair must be used within a LanPairProvider");
  return ctx;
}
