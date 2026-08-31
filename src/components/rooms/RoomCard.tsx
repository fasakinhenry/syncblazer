import { Link } from "react-router-dom";
import { House, Fire, Users } from "@phosphor-icons/react";
import type { Device, Room } from "@/lib/types.ts";
import { Badge } from "@/components/ui/Badge.tsx";

const TYPE_LABEL: Record<Room["type"], string> = {
  personal: "Personal",
  project: "Project",
  temporary: "Instant",
  shared: "Shared",
};

export function RoomCard({ room }: { room: Room }) {
  const deviceCount = Array.isArray(room.deviceIds) ? room.deviceIds.length : 0;
  const onlineCount = (room.deviceIds as Device[]).filter?.((d) => d?.status === "online").length ?? 0;

  return (
    <Link
      to={`/rooms/${room._id}`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-brand/40"
    >
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
          {room.isDefault ? <House className="h-5 w-5" /> : <Fire className="h-5 w-5" />}
        </span>
        <Badge tone={room.isDefault ? "brand" : "neutral"}>{TYPE_LABEL[room.type]}</Badge>
      </div>
      <div>
        <p className="truncate font-medium text-text-primary">{room.name}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
          <Users className="h-3.5 w-3.5" />
          {deviceCount} {deviceCount === 1 ? "device" : "devices"}
          {onlineCount > 0 ? ` · ${onlineCount} online` : ""}
        </p>
      </div>
      {room.code && !room.isDefault ? (
        <p className="truncate rounded-md bg-surface-hover px-2 py-1 font-mono text-xs text-text-secondary">
          {room.code}
        </p>
      ) : null}
    </Link>
  );
}
