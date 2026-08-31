import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api.ts";
import type { Room } from "@/lib/types.ts";
import { useAuth } from "@/context/AuthContext.tsx";
import { useSocket } from "@/context/SocketContext.tsx";

interface RoomContextValue {
  rooms: Room[];
  defaultRoom: Room | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const RoomContext = createContext<RoomContextValue>({
  rooms: [],
  defaultRoom: null,
  loading: true,
  refresh: async () => {},
});

export function RoomProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { socket } = useSocket();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { rooms } = await api.rooms.list();
    setRooms(rooms);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      setRooms([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [status, refresh]);

  // Keep device/member counts on "Your rooms" live: a device connecting or a
  // new member joining a shared room shouldn't need a manual reload to show
  // up here, since this list is what every page reads defaultRoom/rooms from.
  useEffect(() => {
    if (!socket || status !== "authenticated") return;
    const onChange = () => void refresh();

    socket.on("network:changed", onChange);
    socket.on("room:member-joined", onChange);
    return () => {
      socket.off("network:changed", onChange);
      socket.off("room:member-joined", onChange);
    };
  }, [socket, status, refresh]);

  const defaultRoom = useMemo(() => rooms.find((r) => r.isDefault) ?? rooms[0] ?? null, [rooms]);

  const value = useMemo<RoomContextValue>(() => ({ rooms, defaultRoom, loading, refresh }), [rooms, defaultRoom, loading, refresh]);

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRooms(): RoomContextValue {
  return useContext(RoomContext);
}
