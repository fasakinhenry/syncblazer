import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { Check, Monitor, Moon, ShareNetwork, SignOut, Sun, UploadSimple } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext.tsx";
import { useRooms } from "@/context/RoomContext.tsx";
import { useTheme } from "@/context/ThemeContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { api } from "@/lib/api.ts";
import { formatBytes } from "@/lib/format.ts";
import type { MyStats } from "@/lib/types.ts";
import { Avatar } from "@/components/Avatar.tsx";
import { AvatarPicker } from "@/components/AvatarPicker.tsx";
import { TrendChart } from "@/components/TrendChart.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { Badge } from "@/components/ui/Badge.tsx";
import { InstallAppButton } from "@/components/InstallAppButton.tsx";

const canShare = typeof navigator !== "undefined" && "share" in navigator;

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ProfilePage() {
  const { user, logout, updateProfile, deleteAccount } = useAuth();
  const { rooms } = useRooms();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [deviceCount, setDeviceCount] = useState<number | null>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [trendView, setTrendView] = useState<"transfers" | "notes">("transfers");
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.devices.list().then(({ devices }) => setDeviceCount(devices.length));
    api.auth.myStats().then(setStats);
  }, []);

  if (!user) return null;

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === user.name) return;
    setSavingName(true);
    try {
      await updateProfile({ name: trimmed });
      toast("Name updated", "success");
    } finally {
      setSavingName(false);
    }
  };

  const selectAvatar = async (avatarUrl: string) => {
    await updateProfile({ avatarUrl });
    toast("Avatar updated", "success");
  };

  const uploadPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const { url } = await api.noteImages.upload(file);
      await selectAvatar(api.noteImages.absoluteUrl(url));
    } catch {
      toast("Couldn't upload that photo. Try a smaller image.", "error");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const shareProfile = async () => {
    const url = `${window.location.origin}/u/${user.id}`;
    if (canShare) {
      try {
        await navigator.share({ title: `${user.name} on SyncBlaze`, url });
        return;
      } catch {
        // fall through to copy
      }
    }
    await navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("Delete your account and all associated data? This can't be undone.")) return;
    try {
      await deleteAccount();
      toast("Account deleted", "success");
    } catch {
      toast("We couldn't delete this account right now.", "error");
    }
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Avatar name={user.name} src={user.avatarUrl} className="h-16 w-16 text-2xl" />
        <div>
          <div className="flex items-center justify-center gap-2">
            <p className="text-lg font-semibold text-text-primary">{user.name}</p>
            {user.isGuest && <Badge tone="brand">Guest</Badge>}
          </div>
          <p className="text-sm text-text-secondary">{user.email ?? "No email on this guest account"}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={shareProfile} className="gap-1.5">
          {shareCopied ? <Check className="h-3.5 w-3.5" /> : <ShareNetwork className="h-3.5 w-3.5" />}
          {shareCopied ? "Link copied" : "Share profile"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col items-center gap-1 p-4">
          <span className="text-2xl font-semibold text-text-primary">{deviceCount ?? "–"}</span>
          <span className="text-xs text-text-secondary">Devices</span>
        </Card>
        <Card className="flex flex-col items-center gap-1 p-4">
          <span className="text-2xl font-semibold text-text-primary">{rooms.length}</span>
          <span className="text-xs text-text-secondary">Rooms</span>
        </Card>
      </div>

      {stats && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium text-text-primary">Your activity</p>

          <div className="grid grid-cols-4 gap-2 text-center">
            {(
              [
                ["Notes", stats.counts.notes],
                ["Transfers", stats.counts.transfers],
                ["Sent", formatBytes(stats.counts.sentBytes)],
                ["Note views", stats.counts.publicViews],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border p-2">
                <div className="text-lg font-semibold text-text-primary">{value}</div>
                <div className="text-[11px] text-text-secondary">{label}</div>
              </div>
            ))}
          </div>

          {(Object.keys(stats.transfersByType).length > 0 || Object.keys(stats.transfersByMethod).length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(stats.transfersByType).map(([type, count]) => (
                <Badge key={type} tone="neutral">
                  {count} {type}
                  {count === 1 ? "" : "s"}
                </Badge>
              ))}
              {Object.entries(stats.transfersByMethod).map(([method, count]) => (
                <Badge key={method} tone={method === "local" ? "success" : "brand"}>
                  {count} via {method === "local" ? "local network" : "cloud"}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs font-medium text-text-secondary">Last 30 days</p>
            <div className="flex gap-1">
              {(["transfers", "notes"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setTrendView(v)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                    trendView === v ? "bg-brand text-white" : "bg-surface-hover text-text-secondary"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <TrendChart
            data={trendView === "transfers" ? stats.transferTrend : stats.noteTrend}
            label={trendView === "transfers" ? "Transfers" : "Notes created"}
          />
        </Card>
      )}

      <Card className="p-4">
        <p className="mb-3 text-sm font-medium text-text-primary">Name</p>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <Button variant="secondary" onClick={saveName} loading={savingName} disabled={!name.trim() || name.trim() === user.name}>
            Save
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-text-primary">Avatar</p>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={uploadPhoto} />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => photoInputRef.current?.click()}
            loading={uploadingPhoto}
            className="gap-1.5"
          >
            <UploadSimple className="h-3.5 w-3.5" />
            Upload photo
          </Button>
        </div>
        <AvatarPicker current={user.avatarUrl} onSelect={selectAvatar} />
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-sm font-medium text-text-primary">Appearance</p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm ${
                theme === value ? "border-brand bg-brand-soft text-brand" : "border-border text-text-secondary hover:bg-surface-hover"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="divide-y divide-border">
        <Link to="/devices" className="block px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-hover">
          Manage devices
        </Link>
        <Link to="/transfers" className="block px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-hover">
          Transfer history
        </Link>
      </Card>

      <InstallAppButton className="w-full" />

      <Button variant="destructive" onClick={handleDeleteAccount} className="gap-1.5">
        Delete account
      </Button>

      <Button variant="secondary" onClick={logout} className="gap-1.5">
        <SignOut className="h-4 w-4" />
        Sign out
      </Button>
    </div>
  );
}
