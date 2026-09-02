export type DeviceType = "desktop" | "laptop" | "mobile" | "tablet";
export type DevicePlatform = "windows" | "macos" | "linux" | "ios" | "android" | "web";
export type DeviceStatus = "online" | "offline";

export interface Device {
  _id: string;
  ownerId: string;
  name: string;
  type: DeviceType;
  platform: DevicePlatform;
  status: DeviceStatus;
  lastSeenAt: string;
  isCurrent?: boolean;
  /** Whether this device is currently online from the same network as the requesting device. */
  isLocal?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RoomType = "personal" | "project" | "temporary" | "shared";

export interface Room {
  _id: string;
  ownerId: string;
  name: string;
  type: RoomType;
  isDefault: boolean;
  deviceIds: Device[] | string[];
  memberIds: string[];
  code?: string;
  isInstant?: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoomMember {
  _id: string;
  name: string;
  avatarUrl?: string;
}

export type NoteVisibility = "private" | "room";

export interface Note {
  _id: string;
  ownerId: string;
  roomId: string;
  title: string;
  /** Canonical storage format is Markdown. */
  content: string;
  fontFamily: string;
  visibility: NoteVisibility;
  publicShare?: { enabled: boolean; token?: string; viewCount?: number; lastViewedAt?: string };
  createdAt: string;
  updatedAt: string;
}

export interface PublicNote {
  title: string;
  content: string;
  fontFamily: string;
  updatedAt: string;
}

export type TransferType = "file" | "image" | "text" | "link";
export type TransferMethod = "local" | "cloud";
export type TransferStatus =
  | "created"
  | "queued"
  | "connecting"
  | "transferring"
  | "completed"
  | "failed"
  | "retrying"
  | "cancelled";

export interface Transfer {
  _id: string;
  roomId: string;
  ownerId: string;
  senderDeviceId: Device | string;
  receiverDeviceId: Device | string;
  type: TransferType;
  name: string;
  size: number;
  mimeType?: string;
  textContent?: string;
  storageKey?: string;
  status: TransferStatus;
  progress: number;
  transferMethod: TransferMethod;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ActivityType =
  | "transfer"
  | "note_created"
  | "note_updated"
  | "note_deleted"
  | "device_connected"
  | "device_removed"
  | "member_joined";

export interface Activity {
  _id: string;
  ownerId: string;
  roomId: string;
  type: ActivityType;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  clipboardSyncEnabled: boolean;
  screenshotSyncEnabled: boolean;
  defaultDestinationDeviceId?: string;
}

export type AuthProvider = "password" | "google" | "guest";

export interface User {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  authProvider: AuthProvider;
  isGuest: boolean;
  defaultRoomId?: string;
  preferences: UserPreferences;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface AdminOverview {
  users: { total: number; guest: number; google: number; password: number };
  notes: { total: number; public: number };
  rooms: { total: number };
  devices: { total: number };
  transfers: { total: number; completed: number };
  visits: { last24h: number; last7d: number; last30d: number; allTime: number; uniqueLast30d: number };
  signupTrend: TrendPoint[];
  visitTrend: TrendPoint[];
}

export interface AdminUser {
  id: string;
  name: string;
  email?: string;
  authProvider: AuthProvider;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserDetail {
  user: AdminUser;
  counts: { notes: number; rooms: number; devices: number; transfers: number };
}
