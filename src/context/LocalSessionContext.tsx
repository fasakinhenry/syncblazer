import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { LocalPeerConnection, LocalTransferInterruptedError, type LocalTransferMeta } from "@/lib/webrtc/LocalPeerConnection.ts";
import {
  decodeSignalingPayload,
  encodeSignalingPayload,
  randomPeerId,
  type LocalOfferPayload,
} from "@/lib/webrtc/localSignalingCodec.ts";

type SessionRole = "none" | "host" | "guest";

export interface LocalPeerInfo {
  id: string;
  name: string;
  /** "connected" means we ourselves have a live data channel to them.
   * "roster" means we only know about them via the host's peer list (a
   * guest doesn't have a direct link to other guests in the hub topology). */
  status: "connecting" | "connected" | "roster";
}

export interface LocalIncomingTransfer {
  id: string;
  meta: LocalTransferMeta;
  fromPeerName: string;
  bytesTransferred: number;
  status: "receiving" | "completed";
  blob?: Blob;
}

type RosterMessage = { type: "roster"; peers: { id: string; name: string }[] };

interface LocalSessionContextValue {
  role: SessionRole;
  myPeerId: string;
  myName: string;
  peers: LocalPeerInfo[];
  incomingTransfers: LocalIncomingTransfer[];
  pendingInviteCode: string | null;
  connecting: boolean;
  /** How many ICE candidates have been found so far while generating an
   * invite/answer code — null when not actively gathering. Lets the UI show
   * real progress instead of a code that looks ready before it actually is. */
  gatheringCandidateCount: number | null;
  error: string | null;

  startHosting: (name: string) => void;
  createInvite: () => Promise<void>;
  cancelInvite: () => void;
  completeInvite: (answerCode: string) => Promise<void>;

  joinWithOfferCode: (offerCode: string, myName: string) => Promise<string>;

  sendFile: (peerId: string | "all", file: File, kind: "file" | "image", onProgress?: (sent: number, total: number) => void) => Promise<void>;
  sendText: (peerId: string | "all", content: string, kind: "text" | "link", name: string) => Promise<void>;

  dismissIncoming: (id: string) => void;
  leaveSession: () => void;
}

interface PendingLocalReceive {
  id: string;
  meta: LocalTransferMeta;
  chunks: ArrayBuffer[];
  bytesReceived: number;
}

interface PendingLocalSend {
  id: string;
  file: File;
  kind: "file" | "image";
  onProgress?: (sent: number, total: number) => void;
  broadcastMeta?: Partial<LocalTransferMeta>;
}

// There's no persistent signaling channel in this mode — a manual re-scan
// or re-typed code creates an entirely fresh connection (and, on the guest
// side, a fresh peer id), so unlike Quick Connect / Desktop LAN there's
// nothing to automatically reconnect to. What's threaded through here is
// just the interrupted transfer's own state — held as "the one pending
// transfer," not per-peer — so that IF the two devices manually re-pair,
// whichever fresh connection comes up next picks it back up instead of
// starting over. See LocalPeerConnection.ts for the shared wire protocol.
const RESUME_HANDSHAKE_TIMEOUT_MS = 3000;

const LocalSessionContext = createContext<LocalSessionContextValue | null>(null);

export function LocalSessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<SessionRole>("none");
  const [myName, setMyName] = useState("");
  const [peers, setPeers] = useState<LocalPeerInfo[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<LocalIncomingTransfer[]>([]);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [gatheringCandidateCount, setGatheringCandidateCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myPeerIdRef = useRef(randomPeerId());
  const connectionsRef = useRef<Map<string, LocalPeerConnection>>(new Map());
  const pendingConnectionRef = useRef<LocalPeerConnection | null>(null);
  // Which transfer ids the host is currently relaying, and who they came from.
  const relayingFromRef = useRef<Map<string, string>>(new Map());
  // Guards completeInvite/joinWithOfferCode against firing twice for the same
  // handshake (e.g. a duplicate scan result arriving just before React
  // re-renders the disabled state) — setRemoteDescription throws if called
  // a second time once the connection has already moved past that state.
  const handshakeInFlightRef = useRef(false);
  const pendingReceiveRef = useRef<PendingLocalReceive | null>(null);
  const pendingSendRef = useRef<PendingLocalSend | null>(null);
  const resumeOffsetResolverRef = useRef<((bytesReceived: number | null) => void) | null>(null);

  const addIncoming = useCallback((id: string, meta: LocalTransferMeta, fromPeerName: string) => {
    setIncomingTransfers((prev) => [...prev, { id, meta, fromPeerName, bytesTransferred: 0, status: "receiving" }]);
  }, []);

  const broadcastRoster = useCallback((allPeers: LocalPeerInfo[]) => {
    const message: RosterMessage = { type: "roster", peers: allPeers.map((p) => ({ id: p.id, name: p.name })) };
    const json = JSON.stringify(message);
    for (const conn of connectionsRef.current.values()) conn.rawSend(json);
  }, []);

  const removePeer = useCallback(
    (peerId: string) => {
      connectionsRef.current.delete(peerId);
      setPeers((prev) => {
        const next = prev.filter((p) => p.id !== peerId);
        if (role === "host") broadcastRoster(next);
        return next;
      });
    },
    [role, broadcastRoster]
  );

  /** Wires the handlers shared by every connection: receiving files/text,
   * and — for the host only — relaying anything flagged broadcast on to
   * every other connected guest as it streams in. */
  const wireHandlers = useCallback(
    (peerId: string, peerName: string, isHost: boolean) => ({
      onIncomingMeta: (meta: LocalTransferMeta) => {
        if (meta.kind !== "text" && meta.kind !== "link") {
          addIncoming(meta.id, meta, meta.fromPeerName ?? peerName);
        }
        if (isHost && meta.broadcast) relayingFromRef.current.set(meta.id, peerId);
      },
      onProgress: (id: string, bytes: number) => {
        setIncomingTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, bytesTransferred: bytes } : t)));
      },
      onFileComplete: (id: string, blob: Blob) => {
        setIncomingTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, blob, status: "completed" as const } : t)));
        relayingFromRef.current.delete(id);
      },
      onTextComplete: (meta: LocalTransferMeta) => {
        addIncoming(meta.id, meta, meta.fromPeerName ?? peerName);
        setIncomingTransfers((prev) => prev.map((t) => (t.id === meta.id ? { ...t, status: "completed" as const } : t)));
      },
      onReceiveInterrupted: (meta: LocalTransferMeta, chunks: ArrayBuffer[], bytesReceived: number) => {
        pendingReceiveRef.current = { id: meta.id, meta, chunks, bytesReceived };
        const pct = meta.size > 0 ? Math.round((bytesReceived / meta.size) * 100) : 0;
        setError(`Connection lost mid-transfer. Ask them to scan/enter a new code to resume "${meta.name}" from ${pct}%.`);
      },
      onResumeOffsetReceived: (id: string, bytesReceived: number) => {
        if (pendingSendRef.current?.id !== id) return;
        const resolve = resumeOffsetResolverRef.current;
        resumeOffsetResolverRef.current = null;
        resolve?.(bytesReceived);
      },
      onClose: () => removePeer(peerId),
      onRawMessage: (data: string | ArrayBuffer) => {
        // Roster updates (guest side only — host never receives these).
        if (typeof data === "string") {
          try {
            const parsed = JSON.parse(data);
            if (parsed?.type === "roster") {
              const roster = (parsed as RosterMessage).peers.filter((p) => p.id !== myPeerIdRef.current);
              setPeers((prev) => {
                const direct = prev.filter((p) => p.status !== "roster");
                const directIds = new Set(direct.map((p) => p.id));
                const indirect = roster
                  .filter((p) => !directIds.has(p.id))
                  .map((p) => ({ ...p, status: "roster" as const }));
                return [...direct, ...indirect];
              });
              return;
            }
          } catch {
            // not JSON we care about, fall through
          }
        }
        // Host-side broadcast relay: forward to every other connected peer.
        if (!isHost) return;
        for (const [id, fromId] of relayingFromRef.current) {
          if (fromId !== peerId) continue;
          for (const [otherId, conn] of connectionsRef.current) {
            if (otherId === peerId) continue;
            conn.rawSend(data);
          }
          if (typeof data === "string") {
            try {
              const parsed = JSON.parse(data);
              if (parsed?.type === "done" && parsed.id === id) relayingFromRef.current.delete(id);
            } catch {
              /* ignore */
            }
          }
        }
      },
    }),
    [addIncoming, removePeer]
  );

  /** Called once a fresh connection's channel is confirmed open (after a
   * manual re-pair) — hands over anything left mid-receive from the last
   * connection, and resumes anything left mid-send once the other side
   * confirms how much it already has (or restarts it, if it turns out they
   * have nothing — e.g. they reloaded the page and lost their partial state). */
  const attemptResumeOnNewConnection = useCallback((conn: LocalPeerConnection) => {
    const pendingReceive = pendingReceiveRef.current;
    if (pendingReceive) {
      pendingReceiveRef.current = null;
      conn.primeResumedReceive(pendingReceive.meta, pendingReceive.chunks, pendingReceive.bytesReceived);
      conn.sendResumeOffset(pendingReceive.id, pendingReceive.bytesReceived);
    }

    const pendingSend = pendingSendRef.current;
    if (pendingSend) {
      pendingSendRef.current = null;
      const waitForResumeOffset = new Promise<number | null>((resolve) => {
        resumeOffsetResolverRef.current = resolve;
        setTimeout(() => {
          if (resumeOffsetResolverRef.current === resolve) {
            resumeOffsetResolverRef.current = null;
            resolve(null);
          }
        }, RESUME_HANDSHAKE_TIMEOUT_MS);
      });
      void waitForResumeOffset.then((resumeOffset) => {
        conn
          .sendFile(pendingSend.id, pendingSend.file, pendingSend.kind, pendingSend.onProgress, pendingSend.broadcastMeta, resumeOffset ?? 0)
          .catch((err: unknown) => {
            if (err instanceof LocalTransferInterruptedError) {
              pendingSendRef.current = pendingSend;
            } else {
              setError("Couldn't finish sending after reconnecting.");
            }
          });
      });
    }
  }, []);

  // --- Host flow ---

  const startHosting = useCallback((name: string) => {
    myPeerIdRef.current = randomPeerId();
    setMyName(name);
    setRole("host");
    setPeers([]);
    setError(null);
  }, []);

  const createInvite = useCallback(async () => {
    setError(null);
    setConnecting(true);
    setGatheringCandidateCount(0);
    try {
      const conn = new LocalPeerConnection();
      pendingConnectionRef.current = conn;
      const sdp = await conn.createOffer((count) => setGatheringCandidateCount(count));
      const code = await encodeSignalingPayload({
        v: 1,
        kind: "offer",
        sdp,
        hostId: myPeerIdRef.current,
        hostName: myName,
      } satisfies LocalOfferPayload);
      setPendingInviteCode(code);
    } catch {
      setError("Couldn't generate an invite. Please try again.");
    } finally {
      setConnecting(false);
      setGatheringCandidateCount(null);
    }
  }, [myName]);

  const cancelInvite = useCallback(() => {
    pendingConnectionRef.current?.close();
    pendingConnectionRef.current = null;
    setPendingInviteCode(null);
  }, []);

  const completeInvite = useCallback(
    async (answerCode: string) => {
      if (handshakeInFlightRef.current) return;
      const conn = pendingConnectionRef.current;
      if (!conn) return;
      handshakeInFlightRef.current = true;
      setConnecting(true);
      setError(null);
      try {
        const payload = await decodeSignalingPayload(answerCode);
        if (payload.kind !== "answer") throw new Error("That's not a guest's response code.");

        const peerId = payload.guestId;
        const peerName = payload.guestName;
        conn.setHandlers(wireHandlers(peerId, peerName, true));

        await conn.acceptAnswer(payload.sdp);
        // The human hand-off is already done by this point (we're holding
        // their answer code), so this is only the technical ICE handshake —
        // still worth more than the old 10s now that there are a few
        // candidates to check instead of one, not the full 30 minutes.
        await conn.waitForChannelOpen(30 * 1000);

        connectionsRef.current.set(peerId, conn);
        pendingConnectionRef.current = null;
        setPendingInviteCode(null);

        setPeers((prev) => {
          const next = [...prev.filter((p) => p.id !== peerId), { id: peerId, name: peerName, status: "connected" as const }];
          broadcastRoster(next);
          return next;
        });
        attemptResumeOnNewConnection(conn);
      } catch (err) {
        setError(err instanceof Error ? err.message : "That code didn't work. Ask them to try again.");
      } finally {
        handshakeInFlightRef.current = false;
        setConnecting(false);
      }
    },
    [broadcastRoster, wireHandlers, attemptResumeOnNewConnection]
  );

  // --- Guest flow ---

  const joinWithOfferCode = useCallback(
    async (offerCode: string, name: string): Promise<string> => {
      if (handshakeInFlightRef.current) throw new Error("Already connecting");
      handshakeInFlightRef.current = true;
      setError(null);
      setConnecting(true);
      try {
        const payload = await decodeSignalingPayload(offerCode);
        if (payload.kind !== "offer") throw new Error("That's not a host's invite code.");

        myPeerIdRef.current = randomPeerId();
        setMyName(name);
        setRole("guest");

        setGatheringCandidateCount(0);
        const conn = new LocalPeerConnection(wireHandlers(payload.hostId, payload.hostName, false));
        const answerSdp = await conn.acceptOffer(payload.sdp, (count) => setGatheringCandidateCount(count));
        setGatheringCandidateCount(null);
        connectionsRef.current.set(payload.hostId, conn);
        setPeers([{ id: payload.hostId, name: payload.hostName, status: "connecting" }]);

        // This starts counting before the human hand-off (showing the code
        // to the host, them scanning/typing it in) has even happened yet, so
        // it needs to tolerate that delay — not just the fast technical
        // handshake that follows once the host actually submits it.
        conn
          .waitForChannelOpen(30 * 60 * 1000)
          .then(() => {
            setPeers((prev) => prev.map((p) => (p.id === payload.hostId ? { ...p, status: "connected" } : p)));
            attemptResumeOnNewConnection(conn);
          })
          .catch(() => setError("Couldn't finish connecting. Ask the host to invite you again."));

        return await encodeSignalingPayload({
          v: 1,
          kind: "answer",
          sdp: answerSdp,
          guestId: myPeerIdRef.current,
          guestName: name,
        });
      } finally {
        handshakeInFlightRef.current = false;
        setConnecting(false);
      }
    },
    [wireHandlers, attemptResumeOnNewConnection]
  );

  // --- Sending ---

  // No persistent signaling channel means an interrupted send can't
  // auto-resume the way Quick Connect / Desktop LAN do — instead this stashes
  // the pending state and surfaces a specific "ask them to re-pair" message,
  // so a manual re-scan (handled by attemptResumeOnNewConnection above)
  // continues the file instead of restarting it.
  const runSend = useCallback(
    async (conn: LocalPeerConnection, id: string, file: File, kind: "file" | "image", onProgress?: (sent: number, total: number) => void, broadcastMeta?: Partial<LocalTransferMeta>) => {
      try {
        await conn.sendFile(id, file, kind, onProgress, broadcastMeta);
      } catch (err) {
        if (err instanceof LocalTransferInterruptedError) {
          const pct = file.size > 0 ? Math.round((err.offsetSent / file.size) * 100) : 0;
          pendingSendRef.current = { id, file, kind, onProgress, broadcastMeta };
          setError(`Connection lost mid-send. Ask them to scan/enter a new code to resume "${file.name}" from ${pct}%.`);
          return;
        }
        throw err;
      }
    },
    []
  );

  const sendFile = useCallback(
    async (peerId: string | "all", file: File, kind: "file" | "image", onProgress?: (sent: number, total: number) => void) => {
      if (peerId === "all") {
        if (role === "host") {
          await Promise.all(
            [...connectionsRef.current.values()].map((conn) => runSend(conn, crypto.randomUUID(), file, kind, onProgress))
          );
        } else {
          const host = [...connectionsRef.current.values()][0];
          if (!host) throw new Error("Not connected");
          await runSend(host, crypto.randomUUID(), file, kind, onProgress, {
            broadcast: true,
            fromPeerId: myPeerIdRef.current,
            fromPeerName: myName,
          });
        }
        return;
      }
      const conn = connectionsRef.current.get(peerId);
      if (!conn) throw new Error("Not connected to that device");
      await runSend(conn, crypto.randomUUID(), file, kind, onProgress);
    },
    [role, myName, runSend]
  );

  const sendText = useCallback(
    async (peerId: string | "all", content: string, kind: "text" | "link", name: string) => {
      if (peerId === "all") {
        if (role === "host") {
          for (const conn of connectionsRef.current.values()) conn.sendText(crypto.randomUUID(), content, kind, name);
        } else {
          const host = [...connectionsRef.current.values()][0];
          if (!host) throw new Error("Not connected");
          host.sendText(crypto.randomUUID(), content, kind, name, {
            broadcast: true,
            fromPeerId: myPeerIdRef.current,
            fromPeerName: myName,
          });
        }
        return;
      }
      const conn = connectionsRef.current.get(peerId);
      if (!conn) throw new Error("Not connected to that device");
      conn.sendText(crypto.randomUUID(), content, kind, name);
    },
    [role, myName]
  );

  const dismissIncoming = useCallback((id: string) => {
    setIncomingTransfers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const leaveSession = useCallback(() => {
    for (const conn of connectionsRef.current.values()) conn.close();
    connectionsRef.current.clear();
    pendingConnectionRef.current?.close();
    pendingConnectionRef.current = null;
    relayingFromRef.current.clear();
    pendingReceiveRef.current = null;
    pendingSendRef.current = null;
    resumeOffsetResolverRef.current = null;
    setRole("none");
    setPeers([]);
    setPendingInviteCode(null);
    setIncomingTransfers([]);
    setError(null);
  }, []);

  const value = useMemo<LocalSessionContextValue>(
    () => ({
      role,
      myPeerId: myPeerIdRef.current,
      myName,
      peers,
      incomingTransfers,
      pendingInviteCode,
      connecting,
      gatheringCandidateCount,
      error,
      startHosting,
      createInvite,
      cancelInvite,
      completeInvite,
      joinWithOfferCode,
      sendFile,
      sendText,
      dismissIncoming,
      leaveSession,
    }),
    [
      role,
      myName,
      peers,
      incomingTransfers,
      pendingInviteCode,
      connecting,
      gatheringCandidateCount,
      error,
      startHosting,
      createInvite,
      cancelInvite,
      completeInvite,
      joinWithOfferCode,
      sendFile,
      sendText,
      dismissIncoming,
      leaveSession,
    ]
  );

  return <LocalSessionContext.Provider value={value}>{children}</LocalSessionContext.Provider>;
}

export function useLocalSession(): LocalSessionContextValue {
  const ctx = useContext(LocalSessionContext);
  if (!ctx) throw new Error("useLocalSession must be used within a LocalSessionProvider");
  return ctx;
}
