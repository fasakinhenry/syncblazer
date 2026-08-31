import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api.ts";
import type { Room } from "@/lib/types.ts";
import { useAuth } from "@/context/AuthContext.tsx";

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

  const defaultRoom = useMemo(() => rooms.find((r) => r.isDefault) ?? rooms[0] ?? null, [rooms]);

  const value = useMemo<RoomContextValue>(() => ({ rooms, defaultRoom, loading, refresh }), [rooms, defaultRoom, loading, refresh]);

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRooms(): RoomContextValue {
  return useContext(RoomContext);
}
