import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Monitor, Moon, SignOut, Sun } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext.tsx";
import { useRooms } from "@/context/RoomContext.tsx";
import { useTheme } from "@/context/ThemeContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { api } from "@/lib/api.ts";
import { Avatar } from "@/components/Avatar.tsx";
import { AvatarPicker } from "@/components/AvatarPicker.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { Badge } from "@/components/ui/Badge.tsx";
import { InstallAppButton } from "@/components/InstallAppButton.tsx";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ProfilePage() {
  const { user, logout, updateProfile } = useAuth();
  const { rooms } = useRooms();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [deviceCount, setDeviceCount] = useState<number | null>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    api.devices.list().then(({ devices }) => setDeviceCount(devices.length));
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
        <p className="mb-3 text-sm font-medium text-text-primary">Avatar</p>
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

      <InstallAppButton className="w-full md:hidden" />

      <Button variant="secondary" onClick={logout} className="gap-1.5">
        <SignOut className="h-4 w-4" />
        Sign out
      </Button>
    </div>
  );
}
