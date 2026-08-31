import type { Activity, Device, Note, Room, RoomMember, Transfer, User } from "@/lib/types.ts";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

const ACCESS_TOKEN_KEY = "syncblaze.accessToken";
const REFRESH_TOKEN_KEY = "syncblaze.refreshToken";

export const tokenStore = {
  getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  setTokens: (accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export class ApiClientError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipAuth?: boolean;
  isRetry?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return false;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const json = await res.json();
        tokenStore.setTokens(json.data.accessToken, json.data.refreshToken);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipAuth, isRetry, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  const isFormData = body instanceof FormData;
  if (!isFormData) finalHeaders.set("Content-Type", "application/json");

  if (!skipAuth) {
    const token = tokenStore.getAccessToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
  });

  if (res.status === 401 && !skipAuth && !isRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, isRetry: true });
    }
    tokenStore.clear();
    window.dispatchEvent(new CustomEvent("syncblaze:unauthorized"));
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const json = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiClientError(res.status, json?.message ?? res.statusText, json?.details);
  }

  return (json?.data ?? json) as T;
}

interface DeviceInfo {
  name: string;
  type: Device["type"];
  platform: Device["platform"];
}

export const api = {
  auth: {
    register: (input: { name: string; email: string; password: string; device?: DeviceInfo }) =>
      apiFetch<{ user: User; room: Room; device?: Device; accessToken: string; refreshToken: string }>(
        "/auth/register",
        { method: "POST", body: input, skipAuth: true }
      ),
    login: (input: { email: string; password: string; device?: DeviceInfo }) =>
      apiFetch<{ user: User; device?: Device; accessToken: string; refreshToken: string }>("/auth/login", {
        method: "POST",
        body: input,
        skipAuth: true,
      }),
    guest: (input: { device?: DeviceInfo }) =>
      apiFetch<{ user: User; room: Room; device?: Device; accessToken: string; refreshToken: string }>(
        "/auth/guest",
        { method: "POST", body: input, skipAuth: true }
      ),
    googleStatus: () => apiFetch<{ enabled: boolean }>("/auth/google/status", { skipAuth: true }),
    google: (input: { idToken: string; device?: DeviceInfo }) =>
      apiFetch<{ user: User; room?: Room; device?: Device; accessToken: string; refreshToken: string }>(
        "/auth/google",
        { method: "POST", body: input, skipAuth: true }
      ),
    me: () => apiFetch<{ user: User }>("/auth/me"),
    updateMe: (input: { name?: string; avatarUrl?: string }) =>
      apiFetch<{ user: User }>("/auth/me", { method: "PATCH", body: input }),
    deleteAccount: () => apiFetch<{ deleted: boolean }>("/auth/me", { method: "DELETE" }),
  },

  rooms: {
    list: () => apiFetch<{ rooms: Room[] }>("/rooms"),
    get: (roomId: string) =>
      apiFetch<{ room: Room; recentActivity: Activity[]; members: RoomMember[] }>(`/rooms/${roomId}`),
    create: (input: { name: string; type: Room["type"] }) =>
      apiFetch<{ room: Room }>("/rooms", { method: "POST", body: input }),
    createInstant: () => apiFetch<{ room: Room }>("/rooms/instant", { method: "POST" }),
    join: (code: string) => apiFetch<{ room: Room }>("/rooms/join", { method: "POST", body: { code } }),
    update: (roomId: string, input: { name: string }) =>
      apiFetch<{ room: Room }>(`/rooms/${roomId}`, { method: "PATCH", body: input }),
    remove: (roomId: string) => apiFetch<{ roomId: string }>(`/rooms/${roomId}`, { method: "DELETE" }),
  },

  devices: {
    list: () => apiFetch<{ devices: Device[] }>("/devices"),
    rename: (deviceId: string, name: string) =>
      apiFetch<{ device: Device }>(`/devices/${deviceId}`, { method: "PATCH", body: { name } }),
    remove: (deviceId: string) => apiFetch<{ deviceId: string }>(`/devices/${deviceId}`, { method: "DELETE" }),
    createPairingSession: (roomId: string) =>
      apiFetch<{ token: string; shortCode: string; expiresAt: string }>("/devices/pairing-sessions", {
        method: "POST",
        body: { roomId },
      }),
    consumePairingSession: (input: { token?: string; shortCode?: string; device: DeviceInfo }) =>
      apiFetch<{ device: Device; roomId: string }>("/devices/pairing-sessions/consume", {
        method: "POST",
        body: input,
      }),
  },

  notes: {
    list: (params?: { roomId?: string; search?: string }) => {
      const query = new URLSearchParams(params as Record<string, string>).toString();
      return apiFetch<{ notes: Note[] }>(`/notes${query ? `?${query}` : ""}`);
    },
    create: (input: { roomId: string; title?: string; content?: string }) =>
      apiFetch<{ note: Note }>("/notes", { method: "POST", body: input }),
    update: (noteId: string, input: { title?: string; content?: string }) =>
      apiFetch<{ note: Note }>(`/notes/${noteId}`, { method: "PATCH", body: input }),
    remove: (noteId: string) => apiFetch<{ noteId: string }>(`/notes/${noteId}`, { method: "DELETE" }),
  },

  transfers: {
    list: (params?: Record<string, string | number>) => {
      const query = params
        ? new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
        : "";
      return apiFetch<{ transfers: Transfer[]; nextCursor: string | null }>(`/transfers${query ? `?${query}` : ""}`);
    },
    get: (transferId: string) => apiFetch<{ transfer: Transfer }>(`/transfers/${transferId}`),
    create: (input: {
      roomId: string;
      senderDeviceId: string;
      receiverDeviceId: string;
      type: Transfer["type"];
      name: string;
      size?: number;
      mimeType?: string;
      textContent?: string;
      storageKey?: string;
      transferMethod: Transfer["transferMethod"];
    }) => apiFetch<{ transfer: Transfer }>("/transfers", { method: "POST", body: input }),
    updateStatus: (transferId: string, input: { status: Transfer["status"]; progress?: number; errorMessage?: string }) =>
      apiFetch<{ transfer: Transfer }>(`/transfers/${transferId}/status`, { method: "PATCH", body: input }),
    retry: (transferId: string) => apiFetch<{ transfer: Transfer }>(`/transfers/${transferId}/retry`, { method: "POST" }),
  },

  activity: {
    list: (roomId?: string) => apiFetch<{ activity: Activity[] }>(`/activity${roomId ? `?roomId=${roomId}` : ""}`),
  },

  uploads: {
    upload: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiFetch<{ key: string; size: number; mimeType: string }>("/uploads", {
        method: "POST",
        body: formData,
      });
    },
    uploadWithProgress: (file: File, onProgress: (percent: number) => void) =>
      new Promise<{ key: string; size: number; mimeType: string }>((resolve, reject) => {
        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_URL}/uploads`);
        const token = tokenStore.getAccessToken();
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText).data);
          } else {
            const message = (() => {
              try {
                return JSON.parse(xhr.responseText).message;
              } catch {
                return xhr.statusText;
              }
            })();
            reject(new ApiClientError(xhr.status, message ?? "Upload failed"));
          }
        };
        xhr.onerror = () => reject(new ApiClientError(0, "Upload failed. Check your connection and try again."));
        xhr.send(formData);
      }),
    download: async (transferId: string): Promise<Blob> => {
      const token = tokenStore.getAccessToken();
      const res = await fetch(`${API_URL}/uploads/${transferId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new ApiClientError(res.status, "Couldn't download this file");
      return res.blob();
    },
  },
};
