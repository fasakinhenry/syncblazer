import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api.ts";
import type { AppNotification } from "@/lib/types.ts";
import { useAuth } from "@/context/AuthContext.tsx";
import { useSocket } from "@/context/SocketContext.tsx";
import { useRooms } from "@/context/RoomContext.tsx";
import { getLastRead, markRead as markChatRead } from "@/lib/chatReadState.ts";
import { listenForPushRenewal } from "@/lib/push.ts";

export interface ChatUnreadInfo {
  count: number;
  latestAt: string | null;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  unreadByRoom: Map<string, number>;
  chatUnread: Map<string, ChatUnreadInfo>;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearRoomChatUnread: (roomId: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const { socket } = useSocket();
  const { rooms } = useRooms();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [serverUnreadCount, setServerUnreadCount] = useState(0);
  const [chatUnread, setChatUnread] = useState<Map<string, ChatUnreadInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  // Mirror of `notifications` for synchronous reads inside action callbacks
  // (markRead/markAllRead) — avoids nesting a setState call inside another
  // setState's updater function, which React can double-invoke under
  // StrictMode and would double-decrement the unread count in dev.
  const notificationsRef = useRef<AppNotification[]>([]);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const refresh = useCallback(async () => {
    const [{ notifications }, { count }] = await Promise.all([api.notifications.list(), api.notifications.unreadCount()]);
    setNotifications(notifications);
    setServerUnreadCount(count);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      setNotifications([]);
      setServerUnreadCount(0);
      setChatUnread(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [status, refresh]);

  useEffect(() => {
    if (status !== "authenticated") return;
    return listenForPushRenewal();
  }, [status]);

  // Chat has its own, older, local-only unread mechanism (chatReadState.ts +
  // GET /chat/:roomId/unread) — deliberately not duplicated into server
  // Notification documents (would be one row per message). Reseed it
  // whenever the room list changes, same call RoomDetailPage already makes
  // for its own room.
  useEffect(() => {
    if (status !== "authenticated" || rooms.length === 0) {
      setChatUnread(new Map());
      return;
    }
    let cancelled = false;
    Promise.all(
      rooms
        .filter((room) => !room.isDefault)
        .map(async (room) => {
          const { unreadCount, createdAt } = await api.chat.getUnread(room._id, getLastRead(room._id));
          return [room._id, { count: unreadCount, latestAt: createdAt }] as const;
        })
    ).then((entries) => {
      if (!cancelled) setChatUnread(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [status, rooms]);

  useEffect(() => {
    if (!socket || status !== "authenticated") return;

    const onNew = (notification: AppNotification) => {
      // A NOTE_UPDATED row can arrive as an *update* to one already counted
      // as unread (see backend coalescing), not always a genuinely new
      // unread arrival — rather than guess from stale local state, just ask
      // the server for the real count. These events are already rate-limited
      // by that same coalescing, so this isn't a hot path.
      setNotifications((prev) => [notification, ...prev.filter((n) => n._id !== notification._id)].slice(0, 50));
      api.notifications.unreadCount().then(({ count }) => setServerUnreadCount(count));
    };
    const onRead = ({ id }: { id: string }) => {
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n)));
      setServerUnreadCount((c) => Math.max(0, c - 1));
    };
    const onReadAll = () => {
      setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
      setServerUnreadCount(0);
    };
    const onChatActivity = (payload: { roomId: string; senderId: string; createdAt: string }) => {
      if (payload.senderId === user?.id) return;
      setChatUnread((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.roomId);
        next.set(payload.roomId, { count: (existing?.count ?? 0) + 1, latestAt: payload.createdAt });
        return next;
      });
    };

    socket.on("notification:new", onNew);
    socket.on("notification:read", onRead);
    socket.on("notification:read-all", onReadAll);
    socket.on("chat:activity", onChatActivity);
    return () => {
      socket.off("notification:new", onNew);
      socket.off("notification:read", onRead);
      socket.off("notification:read-all", onReadAll);
      socket.off("chat:activity", onChatActivity);
    };
  }, [socket, status, user?.id]);

  const markRead = useCallback(async (id: string) => {
    const target = notificationsRef.current.find((n) => n._id === id);
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    if (target && !target.readAt) setServerUnreadCount((c) => Math.max(0, c - 1));
    await api.notifications.markRead(id).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setServerUnreadCount(0);
    await api.notifications.markAllRead().catch(() => undefined);
  }, []);

  const clearRoomChatUnread = useCallback((roomId: string) => {
    markChatRead(roomId);
    setChatUnread((prev) => {
      if (!prev.has(roomId)) return prev;
      const next = new Map(prev);
      next.set(roomId, { count: 0, latestAt: next.get(roomId)?.latestAt ?? null });
      return next;
    });
  }, []);

  const unreadByRoom = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notifications) {
      if (n.readAt || !n.roomId) continue;
      map.set(n.roomId, (map.get(n.roomId) ?? 0) + 1);
    }
    return map;
  }, [notifications]);

  const chatUnreadTotal = useMemo(() => [...chatUnread.values()].reduce((sum, v) => sum + v.count, 0), [chatUnread]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount: serverUnreadCount + chatUnreadTotal,
      unreadByRoom,
      chatUnread,
      loading,
      refresh,
      markRead,
      markAllRead,
      clearRoomChatUnread,
    }),
    [notifications, serverUnreadCount, chatUnreadTotal, unreadByRoom, chatUnread, loading, refresh, markRead, markAllRead, clearRoomChatUnread]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationProvider");
  return ctx;
}
