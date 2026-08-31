import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, tokenStore } from "@/lib/api.ts";
import { detectDeviceInfo, getCurrentDevice, setCurrentDevice, clearCurrentDevice } from "@/lib/deviceInfo.ts";
import type { Device, User } from "@/lib/types.ts";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface Session {
  user: User;
  device?: Device;
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  currentDevice: Device | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  updateProfile: (input: { name?: string; avatarUrl?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [currentDevice, setCurrentDeviceState] = useState<Device | null>(() => getCurrentDevice());

  const logout = useCallback(() => {
    tokenStore.clear();
    clearCurrentDevice();
    setUser(null);
    setCurrentDeviceState(null);
    setStatus("unauthenticated");
  }, []);

  const applySession = useCallback((session: Session) => {
    tokenStore.setTokens(session.accessToken, session.refreshToken);
    if (session.device) {
      setCurrentDevice(session.device);
      setCurrentDeviceState(session.device);
    }
    setUser(session.user);
    setStatus("authenticated");
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => logout();
    window.addEventListener("syncblaze:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("syncblaze:unauthorized", handleUnauthorized);
  }, [logout]);

  useEffect(() => {
    const token = tokenStore.getAccessToken();
    if (!token) {
      setStatus("unauthenticated");
      return;
    }
    api.auth
      .me()
      .then(({ user }) => {
        setUser(user);
        setStatus("authenticated");
      })
      .catch(() => {
        tokenStore.clear();
        setStatus("unauthenticated");
      });
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const device = detectDeviceInfo();
      applySession(await api.auth.login({ email, password, device }));
    },
    [applySession]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const device = detectDeviceInfo();
      applySession(await api.auth.register({ name, email, password, device }));
    },
    [applySession]
  );

  const continueAsGuest = useCallback(async () => {
    const device = detectDeviceInfo();
    applySession(await api.auth.guest({ device }));
  }, [applySession]);

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      const device = detectDeviceInfo();
      applySession(await api.auth.google({ idToken, device }));
    },
    [applySession]
  );

  const updateProfile = useCallback(async (input: { name?: string; avatarUrl?: string }) => {
    const { user } = await api.auth.updateMe(input);
    setUser(user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, currentDevice, login, register, continueAsGuest, loginWithGoogle, updateProfile, logout }),
    [status, user, currentDevice, login, register, continueAsGuest, loginWithGoogle, updateProfile, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
