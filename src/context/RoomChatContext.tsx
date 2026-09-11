import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSocket } from "@/context/SocketContext.tsx";
import { useAuth } from "@/context/AuthContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { api } from "@/lib/api.ts";
import { markRead } from "@/lib/chatReadState.ts";
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

// Module-level (not component-scoped) caches: leaving the chat page and
// coming back unmounts/remounts RoomChatProvider, and without this,
// EVERY return visit had to redo the whole roster-fetch + envelope-unwrap
// bootstrap from scratch before it could decrypt anything already on
// screen — which is exactly the window where a message could get stuck
// showing "Encrypted message" (see the decrypt effect below for the other
// half of that fix). This device's identity never changes per room, and a
// room's unwrapped keys stay valid for the lifetime of the page, so both
// are safe to keep around across mounts.
let deviceKeyPairSingleton: CryptoKeyPair | null = null;
let devicePublicKeyStrSingleton = "";
let devicePublicKeyUploaded = false;

async function ensureDeviceIdentity(): Promise<{ keyPair: CryptoKeyPair; publicKeyStr: string }> {
  if (!deviceKeyPairSingleton) {
    const { keyPair, publicKeyJwk } = await getOrCreateDeviceKeyPair();
    deviceKeyPairSingleton = keyPair;
    devicePublicKeyStrSingleton = publicKeyToString(publicKeyJwk);
  }
  if (!devicePublicKeyUploaded) {
    await api.devices.setMyPublicKey(devicePublicKeyStrSingleton).catch(() => undefined);
    devicePublicKeyUploaded = true;
  }
  return { keyPair: deviceKeyPairSingleton, publicKeyStr: devicePublicKeyStrSingleton };
}

interface RoomChatKeyState {
  roster: Map<string, DeviceInfo>;
  roomKeys: Map<number, CryptoKey>;
  currentEpoch: number;
}

const roomStateCache = new Map<string, RoomChatKeyState>();

function getRoomState(roomId: string): RoomChatKeyState {
  let state = roomStateCache.get(roomId);
  if (!state) {
    state = { roster: new Map(), roomKeys: new Map(), currentEpoch: 0 };
    roomStateCache.set(roomId, state);
  }
  return state;
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
  /** True once a later message has stamped this one with editsMessageId —
   * `payload` above is already the edited content by the time this is set. */
  edited?: boolean;
  /** True once a later message has stamped this one with deletesMessageId —
   * `payload` is nulled out; the bubble renders a "Message deleted" placeholder. */
  deleted?: boolean;
}

interface RoomChatValue {
  ready: boolean;
  messages: ChatMessage[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  /** Names of everyone else currently typing, e.g. ["Henry"] or ["Henry", "Ada"] — empty when nobody is. */
  typingNames: string[];
  sendText: (text: string, linkPreviewUrl?: string) => void;
  sendAttachment: (file: File, type: "image" | "audio", meta?: { waveform?: number[]; durationSec?: number }) => Promise<void>;
  editMessage: (messageId: string, newText: string) => void;
  deleteMessage: (messageId: string) => void;
  /** Transient "editing this message" UI state, shared between the message
   * list (which starts it from a bubble's action menu) and the composer
   * (which reads/clears it) — kept here so neither has to prop-drill it
   * through RoomChatPage. */
  editingTarget: { id: string; text: string } | null;
  startEditing: (id: string, text: string) => void;
  cancelEditing: () => void;
  notifyTyping: () => void;
  resolveAttachmentUrl: (payload: ChatPayload) => Promise<string | null>;
}

const RoomChatContext = createContext<RoomChatValue | null>(null);

export function useRoomChat(): RoomChatValue {
  const ctx = useContext(RoomChatContext);
  if (!ctx) throw new Error("useRoomChat must be used within a RoomChatProvider");
  return ctx;
}

export function RoomChatProvider({
  roomId,
  members,
  children,
}: {
  roomId: string;
  /** Room roster for resolving a typing userId to a display name — the
   * chat context otherwise never fetches room membership itself. */
  members: { _id: string; name: string }[];
  children: ReactNode;
}) {
  const { socket, connected } = useSocket();
  const { user } = useAuth();
  const { toast } = useToast();

  const nameById = useMemo(() => new Map(members.map((m) => [m._id, m.name])), [members]);

  const [ready, setReady] = useState(false);
  const [rawMessages, setRawMessages] = useState<ChatMessageDto[]>([]);
  const [decryptedById, setDecryptedById] = useState<Map<string, ChatPayload | null>>(new Map());
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<Map<string, number>>(new Map());
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [editingTarget, setEditingTarget] = useState<{ id: string; text: string } | null>(null);

  const chatStateRef = useRef<RoomChatKeyState>(getRoomState(roomId));
  const myKeyPairRef = useRef<CryptoKeyPair | null>(deviceKeyPairSingleton);
  const myPublicKeyStrRef = useRef<string>(devicePublicKeyStrSingleton);
  const cursorRef = useRef<string | null>(null);
  const keyWaitersRef = useRef<((found: boolean) => void)[]>([]);
  const [keysVersion, setKeysVersion] = useState(0);

  // roomId is effectively fixed for this provider's lifetime (tied to the
  // route), but keep the cached state pointer in sync if it ever changes.
  useEffect(() => {
    chatStateRef.current = getRoomState(roomId);
  }, [roomId]);

  const fetchRoster = useCallback(async () => {
    const { devices } = await api.chat.getDevices(roomId);
    chatStateRef.current.roster = new Map(devices.map((d) => [d.deviceId, d]));
    return devices;
  }, [roomId]);

  const tryUnwrapEnvelopes = useCallback(async () => {
    const { envelopes } = await api.chat.getMyKeyEnvelopes(roomId);
    const keyPair = myKeyPairRef.current;
    if (!keyPair) return;

    const state = chatStateRef.current;
    for (const envelope of envelopes) {
      if (state.roomKeys.has(envelope.epoch)) continue;
      const senderDevice = state.roster.get(envelope.fromDeviceId);
      if (!senderDevice) continue;
      try {
        const key = await unwrapRoomKey(envelope.wrappedKey, envelope.iv, keyPair.privateKey, senderDevice.publicKey);
        state.roomKeys.set(envelope.epoch, key);
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
    const state = chatStateRef.current;
    state.roomKeys.set(epoch, roomKey);
    state.currentEpoch = Math.max(state.currentEpoch, epoch);
    setKeysVersion((v) => v + 1);
  }, [roomId, fetchRoster]);

  // Re-wraps the current key for every current member device — called
  // reactively when membership changes while we already hold the key, so a
  // new member can be let in and a removed one loses access going forward.
  const rotateAndDistribute = useCallback(async () => {
    const keyPair = myKeyPairRef.current;
    const state = chatStateRef.current;
    const currentKey = state.roomKeys.get(state.currentEpoch);
    if (!keyPair || !currentKey) return;
    try {
      const devices = await fetchRoster();
      const { epoch } = await api.chat.rotateEpoch(roomId);
      const roomKey = await generateRoomKey();
      const envelopes = await Promise.all(
        devices.map(async (d) => ({ deviceId: d.deviceId, ...(await wrapRoomKeyForDevice(roomKey, keyPair.privateKey, d.publicKey)) }))
      );
      if (envelopes.length > 0) await api.chat.uploadKeyEnvelopes(roomId, epoch, envelopes);
      state.roomKeys.set(epoch, roomKey);
      state.currentEpoch = Math.max(state.currentEpoch, epoch);
      setKeysVersion((v) => v + 1);
    } catch {
      // Best-effort — another member's client will pick this up next time
      // they open chat, or the next membership change tries again.
    }
  }, [roomId, fetchRoster]);

  // Bootstrap: device identity -> roster -> unwrap what we already have ->
  // if we're still missing the current epoch's key, ask around, then
  // self-initialize if nobody answers in time. Cheap/fast on a return
  // visit to a room whose key this device already holds and whose epoch
  // hasn't changed — no waiting, no re-request, just confirms and moves on.
  useEffect(() => {
    if (!socket || !connected) return;
    let cancelled = false;

    (async () => {
      const { keyPair, publicKeyStr } = await ensureDeviceIdentity();
      if (cancelled) return;
      myKeyPairRef.current = keyPair;
      myPublicKeyStrRef.current = publicKeyStr;

      await fetchRoster();
      if (cancelled) return;

      const { epoch } = await api.chat.getEpoch(roomId);
      const state = chatStateRef.current;
      state.currentEpoch = epoch;
      await tryUnwrapEnvelopes();
      if (cancelled) return;

      if (epoch > 0 && !state.roomKeys.has(epoch)) {
        socket.emit("chat:key-request", { roomId, publicKey: myPublicKeyStrRef.current });
        const found = await new Promise<boolean>((resolve) => {
          keyWaitersRef.current.push(resolve);
          setTimeout(() => resolve(false), KEY_REQUEST_TIMEOUT_MS);
        });
        if (cancelled) return;
        if (!found && !state.roomKeys.has(state.currentEpoch)) {
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
        // Opening chat and seeing the history counts as reading it —
        // clears any unread badge for this room.
        const latest = messages[messages.length - 1];
        if (latest) markRead(roomId, new Date(latest.createdAt).getTime());
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
      // Chat is open and this message just showed up — that's "read" too.
      markRead(roomId, new Date(msg.createdAt).getTime());
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
      const state = chatStateRef.current;
      let senderDevice = state.roster.get(payload.fromDeviceId);
      if (!senderDevice) {
        await fetchRoster();
        senderDevice = state.roster.get(payload.fromDeviceId);
      }
      if (!senderDevice) return;
      try {
        const key = await unwrapRoomKey(payload.wrappedKey, payload.iv, keyPair.privateKey, senderDevice.publicKey);
        state.roomKeys.set(payload.epoch, key);
        state.currentEpoch = Math.max(state.currentEpoch, payload.epoch);
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
      const state = chatStateRef.current;
      const currentKey = state.roomKeys.get(state.currentEpoch);
      if (!keyPair || !currentKey) return;
      try {
        const envelope = await wrapRoomKeyForDevice(currentKey, keyPair.privateKey, payload.publicKey);
        await api.chat.uploadKeyEnvelopes(roomId, state.currentEpoch, [{ deviceId: payload.deviceId, ...envelope }]);
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

  // Decrypt whatever we can whenever new messages or new keys show up. A
  // message that failed only because we didn't hold its epoch's key YET
  // (e.g. right after a remount, before key bootstrap finishes) must be
  // retried once that key actually arrives — never treat "no key yet" as a
  // permanent result, only "genuinely never had this epoch's key" is.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const updates = new Map<string, ChatPayload | null>();
      for (const msg of rawMessages) {
        const existing = decryptedById.get(msg._id);
        if (existing !== undefined && existing !== null) continue; // already decrypted successfully
        const key = chatStateRef.current.roomKeys.get(msg.epoch);
        if (!key) {
          if (existing === undefined) updates.set(msg._id, null);
          continue;
        }
        updates.set(msg._id, await decryptMessage(key, msg.ciphertext, msg.iv));
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
      const state = chatStateRef.current;
      const key = state.roomKeys.get(state.currentEpoch);
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
          epoch: state.currentEpoch,
          type: "text",
        });
      });
    },
    [socket, user, roomId, toast]
  );

  const sendAttachment = useCallback(
    async (file: File, type: "image" | "audio", meta?: { waveform?: number[]; durationSec?: number }) => {
      if (!socket || !user) return;
      const state = chatStateRef.current;
      const key = state.roomKeys.get(state.currentEpoch);
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
          payload: { mimeType: file.type, fileName: file.name, waveform: meta?.waveform, durationSec: meta?.durationSec },
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
          waveform: meta?.waveform,
          durationSec: meta?.durationSec,
        };
        const { ciphertext, iv } = await encryptMessage(key, payload);
        socket.emit("chat:message", { roomId, clientMsgId, ciphertext, iv, epoch: state.currentEpoch, type });
      } catch {
        setPending((prev) => prev.filter((p) => p._id !== clientMsgId));
        toast("Couldn't send that attachment. Try again.", "error");
      }
    },
    [socket, user, roomId, toast]
  );

  // Edit/delete are ordinary new encrypted messages carrying editsMessageId
  // / deletesMessageId — the server never needs to know what either means,
  // it just relays them like any other message. The collapse pass in
  // `messages` below is what actually applies them to the target bubble.
  const editMessage = useCallback(
    (messageId: string, newText: string) => {
      if (!socket) return;
      const state = chatStateRef.current;
      const key = state.roomKeys.get(state.currentEpoch);
      if (!key) {
        toast("Chat isn't ready yet — try again in a moment.", "error");
        return;
      }
      void encryptMessage(key, { text: newText, editsMessageId: messageId }).then(({ ciphertext, iv }) => {
        socket.emit("chat:message", {
          roomId,
          clientMsgId: crypto.randomUUID(),
          ciphertext,
          iv,
          epoch: state.currentEpoch,
          type: "text",
        });
      });
    },
    [socket, roomId, toast]
  );

  const deleteMessage = useCallback(
    (messageId: string) => {
      if (!socket) return;
      const state = chatStateRef.current;
      const key = state.roomKeys.get(state.currentEpoch);
      if (!key) {
        toast("Chat isn't ready yet — try again in a moment.", "error");
        return;
      }
      void encryptMessage(key, { deletesMessageId: messageId }).then(({ ciphertext, iv }) => {
        socket.emit("chat:message", {
          roomId,
          clientMsgId: crypto.randomUUID(),
          ciphertext,
          iv,
          epoch: state.currentEpoch,
          type: "text",
        });
      });
    },
    [socket, roomId, toast]
  );

  const startEditing = useCallback((id: string, text: string) => setEditingTarget({ id, text }), []);
  const cancelEditing = useCallback(() => setEditingTarget(null), []);

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

  const typingNames = useMemo(
    () =>
      [...typingUserIds.keys()]
        .filter((id) => id !== user?.id)
        .map((id) => nameById.get(id) ?? "Someone"),
    [typingUserIds, user?.id, nameById]
  );

  const messages = useMemo<ChatMessage[]>(() => {
    // Collapse pass: a message carrying editsMessageId/deletesMessageId is
    // never rendered as its own bubble — it just mutates the target message
    // it names. Later carriers win if a message was edited more than once.
    const editByTarget = new Map<string, { payload: ChatPayload; createdAt: string }>();
    const deletedIds = new Set<string>();
    const carrierIds = new Set<string>();

    for (const msg of rawMessages) {
      const payload = decryptedById.get(msg._id);
      if (!payload) continue;
      if (payload.deletesMessageId) {
        deletedIds.add(payload.deletesMessageId);
        carrierIds.add(msg._id);
      } else if (payload.editsMessageId) {
        const existing = editByTarget.get(payload.editsMessageId);
        if (!existing || existing.createdAt < msg.createdAt) {
          editByTarget.set(payload.editsMessageId, { payload, createdAt: msg.createdAt });
        }
        carrierIds.add(msg._id);
      }
    }

    const fromServer = rawMessages
      .filter((msg) => !carrierIds.has(msg._id))
      .map((msg) => {
        const deleted = deletedIds.has(msg._id);
        const edit = editByTarget.get(msg._id);
        return {
          _id: msg._id,
          senderId: msg.senderId,
          senderName: msg.senderName,
          senderAvatarUrl: msg.senderAvatarUrl,
          isMine: msg.senderId === user?.id,
          type: msg.type,
          createdAt: msg.createdAt,
          payload: deleted ? null : edit ? { ...decryptedById.get(msg._id), text: edit.payload.text } : (decryptedById.get(msg._id) ?? null),
          edited: !deleted && !!edit,
          deleted,
        };
      });
    return [...fromServer, ...pending];
  }, [rawMessages, decryptedById, pending, user?.id]);

  const value = useMemo<RoomChatValue>(
    () => ({
      ready,
      messages,
      hasMore,
      loadingMore,
      loadMore,
      typingNames,
      sendText,
      sendAttachment,
      editMessage,
      deleteMessage,
      editingTarget,
      startEditing,
      cancelEditing,
      notifyTyping,
      resolveAttachmentUrl,
    }),
    [
      ready,
      messages,
      hasMore,
      loadingMore,
      loadMore,
      typingNames,
      sendText,
      sendAttachment,
      editMessage,
      deleteMessage,
      editingTarget,
      startEditing,
      cancelEditing,
      notifyTyping,
      resolveAttachmentUrl,
    ]
  );

  return <RoomChatContext.Provider value={value}>{children}</RoomChatContext.Provider>;
}
