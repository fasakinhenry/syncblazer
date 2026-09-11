import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ChatCircleDots, DeviceMobile, Files, Heart, Note as NoteIcon, UsersThree } from "@phosphor-icons/react";
import { useNotifications } from "@/context/NotificationContext.tsx";
import { useRooms } from "@/context/RoomContext.tsx";
import { Avatar } from "@/components/Avatar.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { FilterPill } from "@/components/ui/FilterPill.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";
import { formatRelativeTime } from "@/lib/format.ts";
import type { AppNotification, NotificationCategory, NotificationType } from "@/lib/types.ts";

type Pill = "all" | NotificationCategory | "chat";

const PILLS: { value: Pill; label: string }[] = [
  { value: "all", label: "All" },
  { value: "rooms", label: "Rooms" },
  { value: "devices", label: "Devices" },
  { value: "notes", label: "Notes" },
  { value: "files", label: "Files" },
  { value: "chat", label: "Chat" },
];

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  member_joined: UsersThree,
  member_removed: UsersThree,
  device_joined: DeviceMobile,
  note_shared: NoteIcon,
  note_updated: NoteIcon,
  note_deleted: NoteIcon,
  file_shared: Files,
  file_liked: Heart,
};

interface ChatRow {
  roomId: string;
  roomName: string;
  count: number;
  latestAt: string | null;
}

export function ActivityPage() {
  const { notifications, unreadCount, chatUnread, markRead, markAllRead, clearRoomChatUnread } = useNotifications();
  const { rooms } = useRooms();
  const navigate = useNavigate();
  const [pill, setPill] = useState<Pill>("all");

  const roomNameById = useMemo(() => new Map(rooms.map((r) => [r._id, r.name])), [rooms]);

  const chatRows: ChatRow[] = useMemo(
    () =>
      [...chatUnread.entries()]
        .filter(([, info]) => info.count > 0)
        .map(([roomId, info]) => ({
          roomId,
          roomName: roomNameById.get(roomId) ?? "Room",
          count: info.count,
          latestAt: info.latestAt,
        }))
        .sort((a, b) => (b.latestAt ?? "").localeCompare(a.latestAt ?? "")),
    [chatUnread, roomNameById]
  );

  const showChatRows = pill === "all" || pill === "chat";
  const filteredNotifications =
    pill === "chat" ? [] : pill === "all" ? notifications : notifications.filter((n) => n.category === pill);

  const onNotificationClick = (n: AppNotification) => {
    void markRead(n._id);
    if (n.roomId) navigate(`/rooms/${n.roomId}`);
  };

  const onChatRowClick = (row: ChatRow) => {
    clearRoomChatUnread(row.roomId);
    navigate(`/rooms/${row.roomId}/chat`);
  };

  const isEmpty = filteredNotifications.length === 0 && (!showChatRows || chatRows.length === 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Activity</h1>
        <Button variant="secondary" size="sm" onClick={() => void markAllRead()} disabled={unreadCount === 0}>
          Mark all read
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {PILLS.map((p) => (
          <FilterPill key={p.value} label={p.label} active={pill === p.value} onClick={() => setPill(p.value)} />
        ))}
      </div>

      {isEmpty ? (
        <EmptyState
          title="Nothing here yet"
          description="Room activity, device joins, notes, and messages will show up here."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {showChatRows &&
            chatRows.map((row) => (
              <button
                key={row.roomId}
                onClick={() => onChatRowClick(row)}
                className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft p-4 text-left transition-colors hover:border-brand/60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
                  <ChatCircleDots className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {row.count} new message{row.count === 1 ? "" : "s"} in {row.roomName}
                  </p>
                  {row.latestAt && <p className="text-xs text-text-secondary">{formatRelativeTime(row.latestAt)}</p>}
                </div>
                <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />
              </button>
            ))}

          {filteredNotifications.map((n) => {
            const Icon = TYPE_ICON[n.type] ?? Bell;
            return (
              <button
                key={n._id}
                onClick={() => onNotificationClick(n)}
                className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:border-brand/40 ${
                  n.readAt ? "border-border bg-surface" : "border-brand/30 bg-brand-soft"
                }`}
              >
                {n.actorId ? (
                  <Avatar name={n.actorName ?? "Someone"} src={n.actorAvatarUrl} className="h-10 w-10 text-sm" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <Icon className="h-5 w-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{n.message}</p>
                  <p className="text-xs text-text-secondary">{formatRelativeTime(n.createdAt)}</p>
                </div>
                {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
