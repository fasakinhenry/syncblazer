import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Socket } from "socket.io-client";
import { createSocket } from "@/lib/socket.ts";
import { tokenStore } from "@/lib/api.ts";
import { useAuth } from "@/context/AuthContext.tsx";

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

export function SocketProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      setSocket(null);
      setConnected(false);
      return;
    }

    const token = tokenStore.getAccessToken();
    if (!token) return;

    const nextSocket = createSocket(token);
    nextSocket.on("connect", () => setConnected(true));
    nextSocket.on("disconnect", () => setConnected(false));
    nextSocket.connect();
    setSocket(nextSocket);

    return () => {
      nextSocket.disconnect();
    };
  }, [status]);

  const value = useMemo<SocketContextValue>(() => ({ socket, connected }), [socket, connected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
