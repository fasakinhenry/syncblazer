import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  ChatCircleDots,
  Check,
  Copy,
  Files,
  FolderOpen,
  Globe,
  PaperPlaneTilt,
  SignOut,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api.ts";
import type { Room, RoomMemberWithDevices } from "@/lib/types.ts";
import { useAuth } from "@/context/AuthContext.tsx";
import { useSocket } from "@/context/SocketContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { useNotifications } from "@/context/NotificationContext.tsx";
import { formatRelativeTime } from "@/lib/format.ts";
import { DEVICE_TYPE_ICON } from "@/components/devices/deviceIcons.tsx";
import { Avatar } from "@/components/Avatar.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Badge } from "@/components/ui/Badge.tsx";
import { ShareTargets } from "@/components/ShareTargets.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";
import { ConfettiBurst } from "@/components/ConfettiBurst.tsx";

type SendTarget =
  | { kind: "device"; personId: string; personName: string; deviceId: string; deviceName: string }
  | { kind: "person"; personId: string; personName: string }
  | { kind: "everyone" };

function targetKey(target: SendTarget): string {
  return target.kind === "device" ? `device:${target.deviceId}` : target.kind === "person" ? `person:${target.personId}` : "everyone";
}

function targetLabel(target: SendTarget): string {
  if (target.kind === "device") return `${target.personName} · ${target.deviceName}`;
  if (target.kind === "person") return `all of ${target.personName}'s devices`;
  return "everyone in this room";
}

export function PublicRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const { toast } = useToast();
  const { chatUnread, unreadByRoom, clearRoomChatUnread } = useNotifications();

  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMemberWithDevices[]>([]);
  const [copied, setCopied] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [sendingKey, setSendingKey] = useState<string | null>(null);

  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<SendTarget | null>(null);

  const chatUnreadCount = roomId ? (chatUnread.get(roomId)?.count ?? 0) : 0;
  const filesUnreadCount = roomId ? (unreadByRoom.get(roomId) ?? 0) : 0;

  useEffect(() => {
    if (!roomId) return;
    if (sessionStorage.getItem("syncblaze.celebrateRoomId") === roomId) {
      sessionStorage.removeItem("syncblaze.celebrateRoomId");
      setCelebrate(true);
    }
  }, [roomId]);

  const loadRoom = () => {
    if (!roomId) return;
    api.rooms.get(roomId).then(({ room }) => setRoom(room));
  };

  const loadMembers = () => {
    if (!roomId) return;
    api.rooms.getMembersWithDevices(roomId).then(({ members }) => setMembers(members));
  };

  useEffect(() => {
    loadRoom();
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (!socket || !roomId) return;
    socket.emit("room:join", roomId);

    const onPresence = () => loadMembers();
    const onMemberJoined = () => {
      loadRoom();
      loadMembers();
    };
    const onMemberRemoved = () => {
      loadRoom();
      loadMembers();
    };
    const onRemovedFrom = (payload: { roomId: string }) => {
      if (payload.roomId === roomId) {
        toast("You were removed from this room", "info");
        navigate("/room");
      }
    };
    const onNetworkChanged = () => loadMembers();

    socket.on("device:presence", onPresence);
    socket.on("room:member-joined", onMemberJoined);
    socket.on("room:member-removed", onMemberRemoved);
    socket.on("room:removed-from", onRemovedFrom);
    socket.on("network:changed", onNetworkChanged);
    return () => {
      socket.off("device:presence", onPresence);
      socket.off("room:member-joined", onMemberJoined);
      socket.off("room:member-removed", onMemberRemoved);
      socket.off("room:removed-from", onRemovedFrom);
      socket.off("network:changed", onNetworkChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, roomId]);

  const copyCode = () => {
    if (!room?.code) return;
    navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deleteRoom = async () => {
    if (!room || !window.confirm(`Delete "${room.name}"? This can't be undone.`)) return;
    await api.rooms.remove(room._id);
    toast("Room deleted", "info");
    navigate("/room");
  };

  const leaveRoom = async () => {
    if (!room || !window.confirm(`Leave "${room.name}"? You'll need a new invite or the join code to get back in.`)) return;
    setLeaving(true);
    try {
      await api.rooms.leave(room._id);
      toast("You left the room", "info");
      navigate("/room");
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't leave the room. Try again.", "error");
      setLeaving(false);
    }
  };

  const openSendMenu = (key: string, target: SendTarget) => {
    setOpenMenuKey((current) => (current === key ? null : key));
    targetRef.current = target;
  };

  const pickFiles = () => {
    setOpenMenuKey(null);
    filesInputRef.current?.click();
  };

  const pickFolder = () => {
    setOpenMenuKey(null);
    folderInputRef.current?.click();
  };

  const uploadChosen = async (fileList: FileList | null) => {
    const target = targetRef.current;
    if (!fileList || fileList.length === 0 || !target || !roomId) return;
    const files = Array.from(fileList);
    const key = targetKey(target);
    setSendingKey(key);
    try {
      await api.roomFiles.upload(
        roomId,
        files,
        target.kind === "everyone"
          ? undefined
          : target.kind === "device"
            ? { recipientId: target.personId, deliverTo: "device", deviceId: target.deviceId }
            : { recipientId: target.personId, deliverTo: "user" }
      );
      toast(`Sent to ${targetLabel(target)} · saved to Files`, "success");
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't send that. Try again.", "error");
    } finally {
      setSendingKey(null);
    }
  };

  const onFilesChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    e.target.value = "";
    void uploadChosen(fileList);
  };

  if (!room) return <PageSpinner />;

  const totalDevices = members.reduce((sum, m) => sum + m.devices.length, 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <input ref={filesInputRef} type="file" multiple className="hidden" onChange={onFilesChosen} />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error - webkitdirectory isn't in the DOM typings but every major browser supports it
        webkitdirectory=""
        className="hidden"
        onChange={onFilesChosen}
      />
      <ConfettiBurst active={celebrate} onComplete={() => setCelebrate(false)} />

      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/room")}
          className="rounded-md p-2 text-text-secondary hover:bg-surface-hover"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-text-primary">{room.name}</h1>
            <Badge tone="brand">
              <Globe className="h-3 w-3" />
              Public
            </Badge>
          </div>
          <p className="text-sm text-text-secondary">
            {members.length} {members.length === 1 ? "person" : "people"} · {totalDevices}{" "}
            {totalDevices === 1 ? "device" : "devices"}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(`/rooms/${room._id}/files`)}
          className="relative shrink-0 gap-1.5"
        >
          <Files className="h-3.5 w-3.5" />
          Files
          {filesUnreadCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-danger px-1 text-[10px] font-semibold text-white">
              {filesUnreadCount > 9 ? "9+" : filesUnreadCount}
            </span>
          )}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            clearRoomChatUnread(room._id);
            navigate(`/rooms/${room._id}/chat`);
          }}
          className="relative shrink-0 gap-1.5"
        >
          <ChatCircleDots className="h-3.5 w-3.5" />
          Chat
          {chatUnreadCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-danger px-1 text-[10px] font-semibold text-white">
              {chatUnreadCount > 9 ? "9+" : chatUnreadCount}
            </span>
          )}
        </Button>
        {room.ownerId === user?.id ? (
          <button
            onClick={deleteRoom}
            className="shrink-0 rounded-md p-2 text-text-secondary hover:bg-danger/10 hover:text-danger"
            aria-label="Delete room"
          >
            <Trash className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={leaveRoom}
            disabled={leaving}
            className="shrink-0 rounded-md p-2 text-text-secondary hover:bg-danger/10 hover:text-danger disabled:opacity-50"
            aria-label="Leave room"
            title="Leave room"
          >
            <SignOut className="h-4 w-4" />
          </button>
        )}
      </div>

      {room.code && (
        <Card className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Anyone with this link can join</p>
            <p className="mt-1 font-mono text-lg text-text-primary">{room.code}</p>
            <p className="mt-1 text-xs text-text-secondary">
              Share it to bring people into this public room — no approval needed.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 sm:items-end">
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-border bg-white p-2">
                <QRCodeSVG value={`${window.location.origin}/room?joinRoom=${room.code}`} size={72} />
              </div>
              <Button variant="secondary" size="sm" onClick={copyCode} className="gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <ShareTargets
              url={`${window.location.origin}/room?joinRoom=${room.code}`}
              title={`Join "${room.name}" on SyncBlaze`}
            />
          </div>
        </Card>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text-secondary">Send something</h2>
          <div className="relative">
            <Button
              size="sm"
              loading={sendingKey === "everyone"}
              onClick={() => openSendMenu("everyone", { kind: "everyone" })}
              className="gap-1.5"
            >
              <PaperPlaneTilt className="h-3.5 w-3.5" />
              Send to everyone
            </Button>
            {openMenuKey === "everyone" && (
              <SendDropdown onPickFiles={pickFiles} onPickFolder={pickFolder} onClose={() => setOpenMenuKey(null)} />
            )}
          </div>
        </div>
        <p className="mb-4 text-xs text-text-secondary">
          Anything sent here is saved to <span className="font-medium text-text-primary">Files</span> so people can grab
          it anytime, even if they're offline right now. This is different from a quick device-to-device send — it always
          goes through the cloud so it's still there later.
        </p>

        {members.length === 0 ? (
          <EmptyState title="No one's here yet" description="Share the link above to bring people into this room." />
        ) : (
          <div className="flex flex-col gap-3">
            {members.map((member) => {
              const isSelf = member._id === user?.id;
              const personKey = `person:${member._id}`;
              return (
                <Card key={member._id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <Avatar name={member.name} src={member.avatarUrl} className="h-9 w-9" />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${
                          member.online ? "bg-success" : "bg-text-secondary/40"
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-text-primary">{isSelf ? "You" : member.name}</p>
                      <p className="text-xs text-text-secondary">
                        {member.online ? "Online" : member.lastSeenAt ? `Last seen ${formatRelativeTime(member.lastSeenAt)}` : "Offline"}
                        {" · "}
                        {member.devices.length} {member.devices.length === 1 ? "device" : "devices"}
                      </p>
                    </div>
                    {!isSelf && (
                      <div className="relative shrink-0">
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={sendingKey === personKey}
                          onClick={() => openSendMenu(personKey, { kind: "person", personId: member._id, personName: member.name })}
                          className="gap-1.5"
                        >
                          <UploadSimple className="h-3.5 w-3.5" />
                          Send to all
                        </Button>
                        {openMenuKey === personKey && (
                          <SendDropdown onPickFiles={pickFiles} onPickFolder={pickFolder} onClose={() => setOpenMenuKey(null)} />
                        )}
                      </div>
                    )}
                  </div>

                  {member.devices.length > 0 && (
                    <div className="grid gap-2 pl-12 sm:grid-cols-2">
                      {member.devices.map((device) => {
                        const Icon = DEVICE_TYPE_ICON[device.type];
                        const online = device.status === "online";
                        const deviceKey = `device:${device._id}`;
                        return (
                          <div key={device._id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                            <Icon className="h-4 w-4 shrink-0 text-text-secondary" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-text-primary">{device.name}</p>
                              <p className="flex items-center gap-1.5 text-xs text-text-secondary">
                                <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-success" : "bg-text-secondary/40"}`} />
                                {online ? "Online" : `Last seen ${formatRelativeTime(device.lastSeenAt)}`}
                              </p>
                            </div>
                            {!isSelf && (
                              <div className="relative shrink-0">
                                <button
                                  onClick={() =>
                                    openSendMenu(deviceKey, {
                                      kind: "device",
                                      personId: member._id,
                                      personName: member.name,
                                      deviceId: device._id,
                                      deviceName: device.name,
                                    })
                                  }
                                  disabled={sendingKey === deviceKey}
                                  className="rounded-md p-1.5 text-text-secondary hover:bg-surface-hover hover:text-brand disabled:opacity-50"
                                  aria-label={`Send to ${device.name}`}
                                >
                                  <UploadSimple className="h-3.5 w-3.5" />
                                </button>
                                {openMenuKey === deviceKey && (
                                  <SendDropdown onPickFiles={pickFiles} onPickFolder={pickFolder} onClose={() => setOpenMenuKey(null)} />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SendDropdown({
  onPickFiles,
  onPickFolder,
  onClose,
}: {
  onPickFiles: () => void;
  onPickFolder: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <button aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={onClose} />
      <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-surface p-1 shadow-lg">
        <button
          onClick={onPickFiles}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
        >
          <UploadSimple className="h-4 w-4" />
          Choose files
        </button>
        <button
          onClick={onPickFolder}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
        >
          <FolderOpen className="h-4 w-4" />
          Choose a folder
        </button>
      </div>
    </>
  );
}
