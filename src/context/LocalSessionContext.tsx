import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { LocalPeerConnection, type LocalTransferMeta } from "@/lib/webrtc/LocalPeerConnection.ts";
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "That code didn't work. Ask them to try again.");
      } finally {
        handshakeInFlightRef.current = false;
        setConnecting(false);
      }
    },
    [broadcastRoster, wireHandlers]
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
    [wireHandlers]
  );

  // --- Sending ---

  const sendFile = useCallback(
    async (peerId: string | "all", file: File, kind: "file" | "image", onProgress?: (sent: number, total: number) => void) => {
      if (peerId === "all") {
        if (role === "host") {
          await Promise.all(
            [...connectionsRef.current.values()].map((conn) => conn.sendFile(crypto.randomUUID(), file, kind, onProgress))
          );
        } else {
          const host = [...connectionsRef.current.values()][0];
          if (!host) throw new Error("Not connected");
          await host.sendFile(crypto.randomUUID(), file, kind, onProgress, {
            broadcast: true,
            fromPeerId: myPeerIdRef.current,
            fromPeerName: myName,
          });
        }
        return;
      }
      const conn = connectionsRef.current.get(peerId);
      if (!conn) throw new Error("Not connected to that device");
      await conn.sendFile(crypto.randomUUID(), file, kind, onProgress);
    },
    [role, myName]
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
