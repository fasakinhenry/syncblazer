import type {
  Activity,
  AdminOverview,
  AdminUser,
  AdminUserDetail,
  AuthProvider,
  ChatMessageDto,
  Device,
  MyStats,
  Note,
  NoteAccessLevel,
  NoteVisibility,
  PublicNote,
  Room,
  RoomMember,
  Transfer,
  TrendPoint,
  User,
} from "@/lib/types.ts";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
const SERVER_ORIGIN = API_URL.replace(/\/api\/?$/, "");

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
  installId?: string;
}

export const api = {
  auth: {
    register: (input: { name: string; email: string; password: string; device?: DeviceInfo; inviteToken?: string }) =>
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
    myStats: () => apiFetch<MyStats>("/auth/me/stats"),
    updateMe: (input: { name?: string; avatarUrl?: string }) =>
      apiFetch<{ user: User }>("/auth/me", { method: "PATCH", body: input }),
    deleteAccount: () => apiFetch<{ deleted: boolean }>("/auth/me", { method: "DELETE" }),
    /** Converts the current guest account into a real one, in place — same
     * user id, so every room/note/device already attached stays attached. */
    upgrade: (input: { name?: string; email: string; password: string }) =>
      apiFetch<{ user: User; accessToken: string; refreshToken: string }>("/auth/upgrade", {
        method: "POST",
        body: input,
      }),
    /** Same, but linking a Google identity instead of setting a password. */
    upgradeWithGoogle: (idToken: string) =>
      apiFetch<{ user: User; accessToken: string; refreshToken: string }>("/auth/upgrade/google", {
        method: "POST",
        body: { idToken },
      }),
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
    /** "added" if the email already had an account (they're in the room
     * now), "invited" if they'll join automatically once they register. */
    invite: (roomId: string, email: string) =>
      apiFetch<{ status: "added" | "invited" }>(`/rooms/${roomId}/invite`, { method: "POST", body: { email } }),
    removeMember: (roomId: string, userId: string) =>
      apiFetch<{ roomId: string; userId: string }>(`/rooms/${roomId}/members/${userId}`, { method: "DELETE" }),
    leave: (roomId: string) => apiFetch<{ roomId: string }>(`/rooms/${roomId}/leave`, { method: "POST" }),
  },

  devices: {
    list: () => apiFetch<{ devices: Device[] }>("/devices"),
    rename: (deviceId: string, name: string) =>
      apiFetch<{ device: Device }>(`/devices/${deviceId}`, { method: "PATCH", body: { name } }),
    remove: (deviceId: string) => apiFetch<{ deviceId: string }>(`/devices/${deviceId}`, { method: "DELETE" }),
    setMyPublicKey: (publicKey: string) =>
      apiFetch<{ deviceId: string }>("/devices/me/public-key", { method: "PUT", body: { publicKey } }),
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
    get: (noteId: string) => apiFetch<{ note: Note }>(`/notes/${noteId}`),
    create: (input: {
      roomId: string;
      title?: string;
      content?: string;
      visibility?: NoteVisibility;
      fontFamily?: string;
    }) => apiFetch<{ note: Note }>("/notes", { method: "POST", body: input }),
    update: (
      noteId: string,
      input: {
        title?: string;
        content?: string;
        visibility?: NoteVisibility;
        roomAccess?: NoteAccessLevel;
        fontFamily?: string;
        roomId?: string;
      }
    ) => apiFetch<{ note: Note }>(`/notes/${noteId}`, { method: "PATCH", body: input }),
    remove: (noteId: string) => apiFetch<{ noteId: string }>(`/notes/${noteId}`, { method: "DELETE" }),
    share: (noteId: string, enabled: boolean, access?: NoteAccessLevel) =>
      apiFetch<{ note: Note }>(`/notes/${noteId}/share`, { method: "POST", body: { enabled, access } }),
    getShared: (token: string) =>
      apiFetch<{ note: PublicNote; owner: { name: string; avatarUrl?: string } | null }>(`/notes/shared/${token}`, {
        skipAuth: true,
      }),
    /** Authenticated: resolves a public share token to the real note (real
     * _id, full editor access if the link allows it) — editing a shared
     * note always requires being signed in, never anonymous. `blockedByGuest`
     * is true when the link allows editing but this account is a guest —
     * distinct from a link that's genuinely view-only. */
    openShared: (token: string) =>
      apiFetch<{ note: Note; canEdit: boolean; blockedByGuest: boolean }>(`/notes/shared/${token}/open`),
  },

  noteImages: {
    upload: async (file: File): Promise<{ key: string; url: string }> => {
      const formData = new FormData();
      formData.append("image", file);
      return apiFetch<{ key: string; url: string }>("/note-images", { method: "POST", body: formData });
    },
    absoluteUrl: (relativeUrl: string) => `${SERVER_ORIGIN}${relativeUrl}`,
  },

  users: {
    getPublic: (userId: string) =>
      apiFetch<{ user: { id: string; name: string; avatarUrl?: string; isGuest: boolean } }>(`/users/${userId}`, {
        skipAuth: true,
      }),
  },

  chat: {
    getDevices: (roomId: string) =>
      apiFetch<{ devices: { deviceId: string; userId: string; name: string; publicKey: string }[] }>(
        `/chat/${roomId}/devices`
      ),
    getEpoch: (roomId: string) => apiFetch<{ epoch: number }>(`/chat/${roomId}/epoch`),
    rotateEpoch: (roomId: string) => apiFetch<{ epoch: number }>(`/chat/${roomId}/rotate`, { method: "POST" }),
    uploadKeyEnvelopes: (roomId: string, epoch: number, envelopes: { deviceId: string; wrappedKey: string; iv: string }[]) =>
      apiFetch<{ count: number }>(`/chat/${roomId}/key-envelopes`, { method: "POST", body: { epoch, envelopes } }),
    getMyKeyEnvelopes: (roomId: string) =>
      apiFetch<{ envelopes: { epoch: number; wrappedKey: string; iv: string; fromDeviceId: string }[] }>(
        `/chat/${roomId}/key-envelopes`
      ),
    listMessages: (roomId: string, before?: string) =>
      apiFetch<{ messages: ChatMessageDto[]; nextCursor: string | null }>(
        `/chat/${roomId}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`
      ),
    getUnread: (roomId: string, since?: number) =>
      apiFetch<{ createdAt: string | null; senderId: string | null; unreadCount: number }>(
        `/chat/${roomId}/unread${since ? `?since=${encodeURIComponent(new Date(since).toISOString())}` : ""}`
      ),
    uploadAttachment: async (blob: Blob): Promise<{ key: string; size: number }> => {
      const formData = new FormData();
      formData.append("file", blob, "attachment");
      return apiFetch<{ key: string; size: number }>("/chat/attachments", { method: "POST", body: formData });
    },
    downloadAttachment: async (key: string): Promise<Blob> => {
      const token = tokenStore.getAccessToken();
      const res = await fetch(`${API_URL}/chat/attachments/${key}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new ApiClientError(res.status, "Couldn't download this attachment");
      return res.blob();
    },
  },

  linkPreview: {
    get: (url: string) =>
      apiFetch<{ url: string; title: string; description: string | null; image: string | null }>(
        `/link-preview?url=${encodeURIComponent(url)}`
      ),
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

  analytics: {
    // Fire-and-forget: a failed pageview beacon should never disrupt the
    // actual page. Includes the access token if present so a logged-in
    // visit gets tagged with a userId, but works fine anonymously too.
    pageview: (input: { path: string; referrer?: string; sessionId: string }) => {
      const token = tokenStore.getAccessToken();
      fetch(`${API_URL}/analytics/pageview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
        keepalive: true,
      }).catch(() => undefined);
    },
  },

  admin: {
    overview: () => apiFetch<AdminOverview>("/admin/overview"),
    visitTrend: (days = 30) => apiFetch<{ trend: TrendPoint[] }>(`/admin/visits?days=${days}`),
    listUsers: (params: { search?: string; authProvider?: AuthProvider; page?: number; limit?: number }) => {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
      ).toString();
      return apiFetch<{ users: AdminUser[]; total: number; page: number; limit: number; totalPages: number }>(
        `/admin/users${query ? `?${query}` : ""}`
      );
    },
    getUser: (userId: string) => apiFetch<AdminUserDetail>(`/admin/users/${userId}`),
    updateUser: (userId: string, input: { name?: string; email?: string }) =>
      apiFetch<{ user: AdminUser }>(`/admin/users/${userId}`, { method: "PATCH", body: input }),
    deleteUser: (userId: string) => apiFetch<{ deleted: boolean }>(`/admin/users/${userId}`, { method: "DELETE" }),
    resetUserSessions: (userId: string) =>
      apiFetch<{ user: AdminUser }>(`/admin/users/${userId}/reset-sessions`, { method: "POST" }),
    emailUser: (userId: string, input: { subject: string; message: string }) =>
      apiFetch<{ sent: boolean }>(`/admin/users/${userId}/email`, { method: "POST", body: input }),
    downloadUsersCsv: async (): Promise<Blob> => {
      const token = tokenStore.getAccessToken();
      const res = await fetch(`${API_URL}/admin/users/export.csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new ApiClientError(res.status, "Couldn't export users");
      return res.blob();
    },
  },
};
