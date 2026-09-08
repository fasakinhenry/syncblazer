import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSocket } from "@/context/SocketContext.tsx";
import { useAuth } from "@/context/AuthContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { api } from "@/lib/api.ts";
import type { ChatMessageDto, ChatMessageType } from "@/lib/types.ts";
import {
  decryptAttachment,
  decryptMessage,
  encryptAttachment,
  encryptMessage,
  generateRoomKey,
  getOrCreateDeviceKeyPair,
  publicKeyToString,
  unwrapRoomKey,
  wrapRoomKeyForDevice,
  type ChatPayload,
} from "@/lib/roomChatCrypto.ts";

// How long to wait for a peer to answer a key-request before assuming
// nobody's around and initializing the room's chat key ourselves.
const KEY_REQUEST_TIMEOUT_MS = 4000;

interface DeviceInfo {
  deviceId: string;
  userId: string;
  name: string;
  publicKey: string;
}

export interface ChatMessage {
  _id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  isMine: boolean;
  type: ChatMessageType;
  createdAt: string;
  /** null while still decrypting or if this device never held the key for
   * the message's epoch (predates joining, or key exchange hasn't landed
   * yet) — the UI shows a lock/placeholder rather than blocking. */
  payload: ChatPayload | null;
  pending?: boolean;
}

interface RoomChatValue {
  ready: boolean;
  messages: ChatMessage[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  someoneTyping: boolean;
  sendText: (text: string, linkPreviewUrl?: string) => void;
  sendAttachment: (file: File, type: "image" | "audio") => Promise<void>;
  notifyTyping: () => void;
  resolveAttachmentUrl: (payload: ChatPayload) => Promise<string | null>;
}

const RoomChatContext = createContext<RoomChatValue | null>(null);

export function useRoomChat(): RoomChatValue {
  const ctx = useContext(RoomChatContext);
  if (!ctx) throw new Error("useRoomChat must be used within a RoomChatProvider");
  return ctx;
}

export function RoomChatProvider({ roomId, children }: { roomId: string; children: ReactNode }) {
  const { socket, connected } = useSocket();
  const { user } = useAuth();
  const { toast } = useToast();

  const [ready, setReady] = useState(false);
  const [rawMessages, setRawMessages] = useState<ChatMessageDto[]>([]);
  const [decryptedById, setDecryptedById] = useState<Map<string, ChatPayload | null>>(new Map());
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<Map<string, number>>(new Map());
  const [pending, setPending] = useState<ChatMessage[]>([]);

  const myKeyPairRef = useRef<CryptoKeyPair | null>(null);
  const myPublicKeyStrRef = useRef<string>("");
  const rosterRef = useRef<Map<string, DeviceInfo>>(new Map());
  const roomKeysRef = useRef<Map<number, CryptoKey>>(new Map());
  const currentEpochRef = useRef(0);
  const cursorRef = useRef<string | null>(null);
  const keyWaitersRef = useRef<((found: boolean) => void)[]>([]);
  const [keysVersion, setKeysVersion] = useState(0);

  const fetchRoster = useCallback(async () => {
    const { devices } = await api.chat.getDevices(roomId);
    rosterRef.current = new Map(devices.map((d) => [d.deviceId, d]));
    return devices;
  }, [roomId]);

  const tryUnwrapEnvelopes = useCallback(async () => {
    const { envelopes } = await api.chat.getMyKeyEnvelopes(roomId);
    const keyPair = myKeyPairRef.current;
    if (!keyPair) return;

    for (const envelope of envelopes) {
      if (roomKeysRef.current.has(envelope.epoch)) continue;
      const senderDevice = rosterRef.current.get(envelope.fromDeviceId);
      if (!senderDevice) continue;
      try {
        const key = await unwrapRoomKey(envelope.wrappedKey, envelope.iv, keyPair.privateKey, senderDevice.publicKey);
        roomKeysRef.current.set(envelope.epoch, key);
      } catch {
        // Wrapped for a device we no longer recognize, or corrupted — skip.
      }
    }
    setKeysVersion((v) => v + 1);
  }, [roomId]);

  const becomeKeyInitializer = useCallback(async () => {
    const keyPair = myKeyPairRef.current;
    if (!keyPair) return;
    const devices = await fetchRoster();
    const { epoch } = await api.chat.rotateEpoch(roomId);
    const roomKey = await generateRoomKey();
    const envelopes = await Promise.all(
      devices.map(async (d) => ({ deviceId: d.deviceId, ...(await wrapRoomKeyForDevice(roomKey, keyPair.privateKey, d.publicKey)) }))
    );
    if (envelopes.length > 0) await api.chat.uploadKeyEnvelopes(roomId, epoch, envelopes);
    roomKeysRef.current.set(epoch, roomKey);
    currentEpochRef.current = Math.max(currentEpochRef.current, epoch);
    setKeysVersion((v) => v + 1);
  }, [roomId, fetchRoster]);

  // Re-wraps the current key for every current member device — called
  // reactively when membership changes while we already hold the key, so a
  // new member can be let in and a removed one loses access going forward.
  const rotateAndDistribute = useCallback(async () => {
    const keyPair = myKeyPairRef.current;
    const currentKey = roomKeysRef.current.get(currentEpochRef.current);
    if (!keyPair || !currentKey) return;
    try {
      const devices = await fetchRoster();
      const { epoch } = await api.chat.rotateEpoch(roomId);
      const roomKey = await generateRoomKey();
      const envelopes = await Promise.all(
        devices.map(async (d) => ({ deviceId: d.deviceId, ...(await wrapRoomKeyForDevice(roomKey, keyPair.privateKey, d.publicKey)) }))
      );
      if (envelopes.length > 0) await api.chat.uploadKeyEnvelopes(roomId, epoch, envelopes);
      roomKeysRef.current.set(epoch, roomKey);
      currentEpochRef.current = Math.max(currentEpochRef.current, epoch);
      setKeysVersion((v) => v + 1);
    } catch {
      // Best-effort — another member's client will pick this up next time
      // they open chat, or the next membership change tries again.
    }
  }, [roomId, fetchRoster]);

  // Bootstrap: keypair -> upload public key -> roster -> unwrap what we
  // already have -> if we're still missing the current epoch's key, ask
  // around, then self-initialize if nobody answers in time.
  useEffect(() => {
    if (!socket || !connected) return;
    let cancelled = false;

    (async () => {
      const { keyPair, publicKeyJwk } = await getOrCreateDeviceKeyPair();
      if (cancelled) return;
      myKeyPairRef.current = keyPair;
      myPublicKeyStrRef.current = publicKeyToString(publicKeyJwk);
      await api.devices.setMyPublicKey(myPublicKeyStrRef.current).catch(() => undefined);
      if (cancelled) return;

      await fetchRoster();
      if (cancelled) return;

      const { epoch } = await api.chat.getEpoch(roomId);
      currentEpochRef.current = epoch;
      await tryUnwrapEnvelopes();
      if (cancelled) return;

      if (epoch > 0 && !roomKeysRef.current.has(epoch)) {
        socket.emit("chat:key-request", { roomId, publicKey: myPublicKeyStrRef.current });
        const found = await new Promise<boolean>((resolve) => {
          keyWaitersRef.current.push(resolve);
          setTimeout(() => resolve(false), KEY_REQUEST_TIMEOUT_MS);
        });
        if (cancelled) return;
        if (!found && !roomKeysRef.current.has(currentEpochRef.current)) {
          await becomeKeyInitializer();
        }
      } else if (epoch === 0) {
        await becomeKeyInitializer();
      }

      if (!cancelled) setReady(true);
    })().catch(() => {
      if (!cancelled) setReady(true); // fail open to "no key yet" rather than an infinite spinner
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, connected, roomId]);

  // Load message history once we're joined.
  useEffect(() => {
    if (!socket || !connected) return;
    let cancelled = false;
    setRawMessages([]);
    cursorRef.current = null;

    api.chat
      .listMessages(roomId)
      .then(({ messages, nextCursor }) => {
        if (cancelled) return;
        setRawMessages(messages);
        cursorRef.current = nextCursor;
        setHasMore(!!nextCursor);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [socket, connected, roomId]);

  const loadMore = useCallback(() => {
    if (!cursorRef.current || loadingMore) return;
    setLoadingMore(true);
    api.chat
      .listMessages(roomId, cursorRef.current)
      .then(({ messages, nextCursor }) => {
        setRawMessages((prev) => [...messages, ...prev]);
        cursorRef.current = nextCursor;
        setHasMore(!!nextCursor);
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [roomId, loadingMore]);

  // Socket relay: live messages, typing, key envelopes, key requests, and
  // membership changes (the last two piggyback on events other features
  // already listen for).
  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit("chat:join", { roomId });

    const onMessage = (msg: ChatMessageDto) => {
      setRawMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]));
      if (msg.clientMsgId) {
        setPending((prev) => prev.filter((p) => p._id !== msg.clientMsgId));
      }
    };

    const onTyping = ({ userId }: { roomId: string; userId: string }) => {
      setTypingUserIds((prev) => {
        const next = new Map(prev);
        next.set(userId, Date.now());
        return next;
      });
    };

    const onKeyEnvelope = async (payload: { roomId: string; epoch: number; wrappedKey: string; iv: string; fromDeviceId: string }) => {
      if (payload.roomId !== roomId) return;
      const keyPair = myKeyPairRef.current;
      if (!keyPair) return;
      let senderDevice = rosterRef.current.get(payload.fromDeviceId);
      if (!senderDevice) {
        await fetchRoster();
        senderDevice = rosterRef.current.get(payload.fromDeviceId);
      }
      if (!senderDevice) return;
      try {
        const key = await unwrapRoomKey(payload.wrappedKey, payload.iv, keyPair.privateKey, senderDevice.publicKey);
        roomKeysRef.current.set(payload.epoch, key);
        currentEpochRef.current = Math.max(currentEpochRef.current, payload.epoch);
        setKeysVersion((v) => v + 1);
        const waiters = keyWaitersRef.current;
        keyWaitersRef.current = [];
        waiters.forEach((resolve) => resolve(true));
      } catch {
        // Not for us / corrupted — ignore.
      }
    };

    const onKeyRequest = async (payload: { roomId: string; deviceId: string; publicKey: string }) => {
      if (payload.roomId !== roomId) return;
      const keyPair = myKeyPairRef.current;
      const currentKey = roomKeysRef.current.get(currentEpochRef.current);
      if (!keyPair || !currentKey) return;
      try {
        const envelope = await wrapRoomKeyForDevice(currentKey, keyPair.privateKey, payload.publicKey);
        await api.chat.uploadKeyEnvelopes(roomId, currentEpochRef.current, [{ deviceId: payload.deviceId, ...envelope }]);
      } catch {
        // Best-effort — the requester will time out and self-initialize.
      }
    };

    const onMembershipChanged = () => {
      void rotateAndDistribute();
    };

    socket.on("chat:message", onMessage);
    socket.on("chat:typing", onTyping);
    socket.on("chat:key-envelope", onKeyEnvelope);
    socket.on("chat:key-request", onKeyRequest);
    socket.on("room:member-joined", onMembershipChanged);
    socket.on("room:member-removed", onMembershipChanged);

    return () => {
      socket.emit("chat:leave", { roomId });
      socket.off("chat:message", onMessage);
      socket.off("chat:typing", onTyping);
      socket.off("chat:key-envelope", onKeyEnvelope);
      socket.off("chat:key-request", onKeyRequest);
      socket.off("room:member-joined", onMembershipChanged);
      socket.off("room:member-removed", onMembershipChanged);
    };
  }, [socket, connected, roomId, rotateAndDistribute, fetchRoster]);

  // Drop stale typing indicators after a few seconds of silence.
  useEffect(() => {
    const interval = setInterval(() => {
      setTypingUserIds((prev) => {
        const cutoff = Date.now() - 4000;
        const next = new Map([...prev].filter(([, t]) => t > cutoff));
        return next.size === prev.size ? prev : next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Decrypt whatever we can whenever new messages or new keys show up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const updates = new Map<string, ChatPayload | null>();
      for (const msg of rawMessages) {
        if (decryptedById.has(msg._id)) continue;
        const key = roomKeysRef.current.get(msg.epoch);
        updates.set(msg._id, key ? await decryptMessage(key, msg.ciphertext, msg.iv) : null);
      }
      if (!cancelled && updates.size > 0) {
        setDecryptedById((prev) => {
          const next = new Map(prev);
          updates.forEach((v, k) => next.set(k, v));
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMessages, keysVersion]);

  const sendText = useCallback(
    (text: string, linkPreviewUrl?: string) => {
      if (!socket || !user) return;
      const key = roomKeysRef.current.get(currentEpochRef.current);
      if (!key) {
        toast("Chat isn't ready yet — try again in a moment.", "error");
        return;
      }
      const clientMsgId = crypto.randomUUID();
      const localMsg: ChatMessage = {
        _id: clientMsgId,
        senderId: user.id,
        senderName: user.name,
        senderAvatarUrl: user.avatarUrl,
        isMine: true,
        type: "text",
        createdAt: new Date().toISOString(),
        payload: { text, linkPreviewUrl },
        pending: true,
      };
      setPending((prev) => [...prev, localMsg]);

      void encryptMessage(key, { text, linkPreviewUrl }).then(({ ciphertext, iv }) => {
        socket.emit("chat:message", {
          roomId,
          clientMsgId,
          ciphertext,
          iv,
          epoch: currentEpochRef.current,
          type: "text",
        });
      });
    },
    [socket, user, roomId, toast]
  );

  const sendAttachment = useCallback(
    async (file: File, type: "image" | "audio") => {
      if (!socket || !user) return;
      const key = roomKeysRef.current.get(currentEpochRef.current);
      if (!key) {
        toast("Chat isn't ready yet — try again in a moment.", "error");
        return;
      }
      const clientMsgId = crypto.randomUUID();
      setPending((prev) => [
        ...prev,
        {
          _id: clientMsgId,
          senderId: user.id,
          senderName: user.name,
          senderAvatarUrl: user.avatarUrl,
          isMine: true,
          type,
          createdAt: new Date().toISOString(),
          payload: { mimeType: file.type, fileName: file.name },
          pending: true,
        },
      ]);

      try {
        const { blob, keyB64, ivB64 } = await encryptAttachment(file);
        const { key: storageKey } = await api.chat.uploadAttachment(blob);
        const payload: ChatPayload = {
          attachmentKey: storageKey,
          attachmentKeyB64: keyB64,
          attachmentIvB64: ivB64,
          mimeType: file.type,
          fileName: file.name,
        };
        const { ciphertext, iv } = await encryptMessage(key, payload);
        socket.emit("chat:message", { roomId, clientMsgId, ciphertext, iv, epoch: currentEpochRef.current, type });
      } catch {
        setPending((prev) => prev.filter((p) => p._id !== clientMsgId));
        toast("Couldn't send that attachment. Try again.", "error");
      }
    },
    [socket, user, roomId, toast]
  );

  const notifyTyping = useCallback(() => {
    socket?.emit("chat:typing", { roomId });
  }, [socket, roomId]);

  const resolveAttachmentUrl = useCallback(async (payload: ChatPayload): Promise<string | null> => {
    if (!payload.attachmentKey || !payload.attachmentKeyB64 || !payload.attachmentIvB64) return null;
    try {
      const encryptedBlob = await api.chat.downloadAttachment(payload.attachmentKey);
      const decrypted = await decryptAttachment(encryptedBlob, payload.attachmentKeyB64, payload.attachmentIvB64, payload.mimeType);
      return URL.createObjectURL(decrypted);
    } catch {
      return null;
    }
  }, []);

  const someoneTyping = useMemo(
    () => [...typingUserIds.keys()].some((id) => id !== user?.id),
    [typingUserIds, user?.id]
  );

  const messages = useMemo<ChatMessage[]>(() => {
    const fromServer = rawMessages.map((msg) => ({
      _id: msg._id,
      senderId: msg.senderId,
      senderName: msg.senderName,
      senderAvatarUrl: msg.senderAvatarUrl,
      isMine: msg.senderId === user?.id,
      type: msg.type,
      createdAt: msg.createdAt,
      payload: decryptedById.get(msg._id) ?? null,
    }));
    return [...fromServer, ...pending];
  }, [rawMessages, decryptedById, pending, user?.id]);

  const value = useMemo<RoomChatValue>(
    () => ({ ready, messages, hasMore, loadingMore, loadMore, someoneTyping, sendText, sendAttachment, notifyTyping, resolveAttachmentUrl }),
    [ready, messages, hasMore, loadingMore, loadMore, someoneTyping, sendText, sendAttachment, notifyTyping, resolveAttachmentUrl]
  );

  return <RoomChatContext.Provider value={value}>{children}</RoomChatContext.Provider>;
}
