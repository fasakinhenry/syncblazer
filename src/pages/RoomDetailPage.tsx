import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Check, CloudArrowUp, Copy, Fire, Trash, UploadSimple, WifiHigh } from "@phosphor-icons/react";
import { api } from "@/lib/api.ts";
import type { Activity, Device, Room, RoomMember } from "@/lib/types.ts";
import { useAuth } from "@/context/AuthContext.tsx";
import { useSocket } from "@/context/SocketContext.tsx";
import { useSendToDevice } from "@/hooks/useSendToDevice.ts";
import { useToast } from "@/context/ToastContext.tsx";
import { formatRelativeTime } from "@/lib/format.ts";
import { getCurrentDevice } from "@/lib/deviceInfo.ts";
import { DEVICE_TYPE_ICON } from "@/components/devices/deviceIcons.tsx";
import { Avatar } from "@/components/Avatar.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";
import { ConfettiBurst } from "@/components/ConfettiBurst.tsx";

export function RoomDetailPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const { toast } = useToast();
  const { send, sendingTo } = useSendToDevice(roomId);

  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [copied, setCopied] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<{ id: string; name: string } | null>(null);
  const currentDeviceId = getCurrentDevice()?._id;

  useEffect(() => {
    if (!roomId) return;
    if (sessionStorage.getItem("syncblaze.celebrateRoomId") === roomId) {
      sessionStorage.removeItem("syncblaze.celebrateRoomId");
      setCelebrate(true);
    }
  }, [roomId]);

  const load = () => {
    if (!roomId) return;
    api.rooms.get(roomId).then(({ room, recentActivity, members }) => {
      setRoom(room);
      setMembers(members);
      setActivity(recentActivity);
    });
  };

  useEffect(load, [roomId]);

  useEffect(() => {
    if (!socket || !roomId) return;
    socket.emit("room:join", roomId);

    const onPresence = (payload: { deviceId: string; status: Device["status"]; lastSeenAt: string }) => {
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              deviceIds: (prev.deviceIds as Device[]).map((d) =>
                d._id === payload.deviceId ? { ...d, status: payload.status, lastSeenAt: payload.lastSeenAt } : d
              ),
            }
          : prev
      );
    };
    const onActivity = (item: Activity) => setActivity((prev) => [item, ...prev].slice(0, 20));
    const onMemberJoined = () => load();
    // device:presence above only updates a device already in the list — it
    // can't add one. A brand-new device (just paired, or just logged in on
    // another of your devices) needs a real refetch to show up without a
    // manual reload; the backend emits this alongside every presence change.
    const onNetworkChanged = () => load();

    socket.on("device:presence", onPresence);
    socket.on("activity:new", onActivity);
    socket.on("room:member-joined", onMemberJoined);
    socket.on("network:changed", onNetworkChanged);
    return () => {
      socket.off("device:presence", onPresence);
      socket.off("activity:new", onActivity);
      socket.off("room:member-joined", onMemberJoined);
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

  const triggerSend = (device: Device) => {
    targetRef.current = { id: device._id, name: device.name };
    fileInputRef.current?.click();
  };

  const onFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = targetRef.current;
    e.target.value = "";
    if (!file || !target) return;
    void send(target.id, target.name, file);
  };

  const deleteRoom = async () => {
    if (!room || !window.confirm(`Delete "${room.name}"? This can't be undone.`)) return;
    await api.rooms.remove(room._id);
    toast("Room deleted", "info");
    navigate("/room");
  };

  if (!room) return <PageSpinner />;

  const devices = room.deviceIds as Device[];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChosen} />
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
          <h1 className="truncate text-xl font-semibold text-text-primary">{room.name}</h1>
          <p className="text-sm text-text-secondary">
            {members.length} {members.length === 1 ? "person" : "people"} · {devices.length}{" "}
            {devices.length === 1 ? "device" : "devices"}
          </p>
        </div>
        {room.ownerId === user?.id && !room.isDefault && (
          <button
            onClick={deleteRoom}
            className="shrink-0 rounded-md p-2 text-text-secondary hover:bg-danger/10 hover:text-danger"
            aria-label="Delete room"
          >
            <Trash className="h-4 w-4" />
          </button>
        )}
      </div>

      {room.code && !room.isDefault && (
        <Card className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Invite someone to this room</p>
            <p className="mt-1 font-mono text-lg text-text-primary">{room.code}</p>
            <p className="mt-1 text-xs text-text-secondary">
              Anyone with this code can join and send files here.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-border bg-white p-2">
              <QRCodeSVG value={`${window.location.origin}/room?joinRoom=${room.code}`} size={72} />
            </div>
            <Button variant="secondary" size="sm" onClick={copyCode} className="gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Devices here</h2>
        {devices.length === 0 ? (
          <EmptyState title="No devices yet" description="Devices that join this room will show up here." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {devices.map((device) => {
              const Icon = DEVICE_TYPE_ICON[device.type];
              const online = device.status === "online";
              const isCurrent = device._id === currentDeviceId;
              const isSending = sendingTo === device._id;
              return (
                <Card key={device._id} className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text-primary">
                      {device.name} {isCurrent ? <span className="text-xs text-text-secondary">(this device)</span> : null}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-success" : "bg-text-secondary/40"}`} />
                      {online ? "Online" : `Last seen ${formatRelativeTime(device.lastSeenAt)}`}
                      {device.isLocal ? " · same network" : ""}
                    </p>
                  </div>
                  {!isCurrent && online && (
                    <Button size="sm" variant="secondary" loading={isSending} onClick={() => triggerSend(device)} className="shrink-0 gap-1.5">
                      <UploadSimple className="h-3.5 w-3.5" />
                      Send
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Activity</h2>
        {activity.length === 0 ? (
          <EmptyState title="Nothing here yet" description="Transfers and joins in this room will show up here." />
        ) : (
          <Card className="divide-y divide-border">
            {activity.map((item) => {
              const transferMethod = item.type === "transfer" ? (item.metadata?.transferMethod as string | undefined) : undefined;
              return (
                <div key={item._id} className="flex items-center gap-3 px-4 py-3">
                  <Fire className="h-4 w-4 shrink-0 text-text-secondary" />
                  <p className="flex-1 text-sm text-text-primary">{item.message}</p>
                  {transferMethod && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                      {transferMethod === "local" ? (
                        <WifiHigh className="h-3 w-3" />
                      ) : (
                        <CloudArrowUp className="h-3 w-3" />
                      )}
                      {transferMethod === "local" ? "Local network" : "Cloud"}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-text-secondary">{formatRelativeTime(item.createdAt)}</span>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {members.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-text-secondary">People</h2>
          <div className="flex flex-wrap gap-3">
            {members.map((member) => (
              <div key={member._id} className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3">
                <Avatar name={member.name} src={member.avatarUrl} className="h-6 w-6 text-xs" />
                <span className="text-sm text-text-primary">{member._id === user?.id ? "You" : member.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
