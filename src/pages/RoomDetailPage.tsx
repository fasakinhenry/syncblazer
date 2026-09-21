import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  ChatCircleDots,
  Check,
  CloudArrowUp,
  Copy,
  Fire,
  PaperPlaneTilt,
  SignOut,
  Trash,
  UploadSimple,
  WifiHigh,
  X,
} from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api.ts";
import type { Activity, Device, Room, RoomMember } from "@/lib/types.ts";
import { useAuth } from "@/context/AuthContext.tsx";
import { useSocket } from "@/context/SocketContext.tsx";
import { useSendToDevice } from "@/hooks/useSendToDevice.ts";
import { useToast } from "@/context/ToastContext.tsx";
import { formatRelativeTime } from "@/lib/format.ts";
import { getCurrentDevice } from "@/lib/deviceInfo.ts";
import { withFolderRelativeName } from "@/lib/fileUtils.ts";
import { DEVICE_TYPE_ICON } from "@/components/devices/deviceIcons.tsx";
import { Avatar } from "@/components/Avatar.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { ShareTargets } from "@/components/ShareTargets.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";
import { ConfettiBurst } from "@/components/ConfettiBurst.tsx";
import { useNotifications } from "@/context/NotificationContext.tsx";
import { SendDropdown } from "@/components/rooms/SendDropdown.tsx";
import { SendBatchPanel, type SendBatch, type SendBatchFile } from "@/components/rooms/SendBatchPanel.tsx";

// Module-level, not a ref: the gap between opening a native file/folder
// picker and its change event firing can be long (browsing a folder,
// confirming the browser's own "trust this site" dialog), and if anything
// causes this component to remount in that window a ref would reset to
// null, silently losing which device the picker was even opened for. A
// module-level variable survives that since it isn't tied to the
// component instance — there's only ever one of these pickers open at a
// time for this page anyway.
let pendingSendTarget: { id: string; name: string } | null = null;

export function RoomDetailPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const { toast } = useToast();
  const { send } = useSendToDevice(roomId);

  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [copied, setCopied] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [sendBatches, setSendBatches] = useState<SendBatch[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const currentDeviceId = getCurrentDevice()?._id;
  const { chatUnread, clearRoomChatUnread } = useNotifications();
  const unreadCount = roomId ? (chatUnread.get(roomId)?.count ?? 0) : 0;

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
    const onMemberRemoved = () => load();
    const onRemovedFrom = (payload: { roomId: string }) => {
      if (payload.roomId === roomId) {
        toast("You were removed from this room", "info");
        navigate("/room");
      }
    };
    // device:presence above only updates a device already in the list — it
    // can't add one. A brand-new device (just paired, or just logged in on
    // another of your devices) needs a real refetch to show up without a
    // manual reload; the backend emits this alongside every presence change.
    const onNetworkChanged = () => load();

    socket.on("device:presence", onPresence);
    socket.on("activity:new", onActivity);
    socket.on("room:member-joined", onMemberJoined);
    socket.on("room:member-removed", onMemberRemoved);
    socket.on("room:removed-from", onRemovedFrom);
    socket.on("network:changed", onNetworkChanged);
    return () => {
      socket.off("device:presence", onPresence);
      socket.off("activity:new", onActivity);
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

  const openSendMenu = (device: Device) => {
    setOpenMenuKey((current) => (current === device._id ? null : device._id));
    pendingSendTarget = { id: device._id, name: device.name };
  };

  const pickFiles = () => {
    setOpenMenuKey(null);
    fileInputRef.current?.click();
  };

  const pickFolder = () => {
    setOpenMenuKey(null);
    // The browser shows its own "only upload folders you trust this site
    // with" confirmation before handing back the files — expected, not an
    // error, but easy to mistake for one if it's the only thing on screen.
    toast("Your browser will ask you to confirm the folder — click Upload to continue.", "info");
    folderInputRef.current?.click();
  };

  const updateBatchFile = (batchId: string, fileId: string, patch: Partial<SendBatchFile>) => {
    setSendBatches((prev) =>
      prev.map((b) =>
        b.id !== batchId ? b : { ...b, files: b.files.map((f) => (f.id !== fileId ? f : { ...f, ...patch })) }
      )
    );
  };

  const dismissBatch = (batchId: string) => {
    setSendBatches((prev) => prev.filter((b) => b.id !== batchId));
  };

  const uploadChosen = async (fileList: FileList | null) => {
    const target = pendingSendTarget;
    // Neither of these should ever be true in normal use — but silently
    // returning here is exactly what "picked a folder and nothing
    // happened" looks like from the outside, so surface it instead of
    // guessing why later.
    if (!target) {
      toast("Couldn't tell who to send to — try clicking Send again.", "error");
      return;
    }
    if (!fileList || fileList.length === 0) {
      toast("No files were selected.", "info");
      return;
    }

    try {
      const files = Array.from(fileList).map(withFolderRelativeName);
      const batchId = crypto.randomUUID();
      const batch: SendBatch = {
        id: batchId,
        targetLabel: target.name,
        files: files.map((file) => ({ id: crypto.randomUUID(), name: file.name, size: file.size, progress: 0, status: "connecting" })),
      };
      setSendBatches((prev) => [batch, ...prev]);
      setSendingKey(target.id);
      // Immediate feedback independent of the panel above — so picking a
      // folder always visibly does *something* right away, even before
      // the first file's status has a chance to update.
      toast(
        files.length === 1 ? `Sending "${files[0].name}" to ${target.name}…` : `Sending ${files.length} files to ${target.name}…`,
        "info"
      );

      // Sequential, not parallel: a device's P2P data channel can only
      // carry one file at a time — sending two at once would interleave
      // their chunks on the wire and corrupt both. Cloud fallback has no
      // such limit, but it's simplest (and just as correct) to treat
      // every file in the batch the same way here.
      let anyFailed = false;
      let skipP2P = false;
      for (const [i, file] of files.entries()) {
        const fileEntryId = batch.files[i].id;
        updateBatchFile(batchId, fileEntryId, { status: skipP2P ? "uploading" : "connecting" });
        try {
          const method = await send(target.id, target.name, file, {
            silent: true,
            skipP2P,
            onPhase: (phase) => updateBatchFile(batchId, fileEntryId, { status: phase === "connecting" ? "connecting" : "uploading" }),
            onProgress: (percent) => updateBatchFile(batchId, fileEntryId, { progress: percent }),
          });
          // A device unreachable directly for one file will be unreachable
          // for the rest of this batch too — skip straight to cloud for
          // them instead of each separately waiting out the connection
          // timeout before falling back.
          if (method === "cloud") skipP2P = true;
          updateBatchFile(batchId, fileEntryId, { status: "done", progress: 100 });
        } catch (err) {
          anyFailed = true;
          updateBatchFile(batchId, fileEntryId, {
            status: "error",
            error: err instanceof ApiClientError ? err.message : "Failed to send",
          });
        }
      }

      if (anyFailed) {
        toast(`Some files couldn't be sent to ${target.name}`, "error");
      } else {
        setTimeout(() => dismissBatch(batchId), 4000);
      }
    } catch (err) {
      // Anything that fails before/between per-file attempts (building the
      // batch, reading the FileList) must still surface — otherwise it's
      // exactly the silent "nothing happens" this whole panel exists to fix.
      toast(err instanceof ApiClientError ? err.message : "Couldn't start that send. Try again.", "error");
    } finally {
      setSendingKey(null);
    }
  };

  const onFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    e.target.value = "";
    void uploadChosen(fileList);
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

  const onInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!roomId || !inviteEmail.trim()) return;
    setInviteError(null);
    setInviting(true);
    try {
      const { status } = await api.rooms.invite(roomId, inviteEmail.trim());
      toast(status === "added" ? "Added to the room" : "Invite sent", "success");
      setInviteEmail("");
      load();
    } catch (err) {
      setInviteError(err instanceof ApiClientError ? err.message : "Couldn't send that invite. Try again.");
    } finally {
      setInviting(false);
    }
  };

  const onRemoveMember = async (memberId: string) => {
    if (!roomId || !window.confirm("Remove this person from the room?")) return;
    setRemovingId(memberId);
    try {
      await api.rooms.removeMember(roomId, memberId);
      setMembers((prev) => prev.filter((m) => m._id !== memberId));
      toast("Removed from room", "info");
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't remove that person.", "error");
    } finally {
      setRemovingId(null);
    }
  };

  if (!room) return <PageSpinner />;

  const devices = room.deviceIds as Device[];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileChosen} />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error - webkitdirectory isn't in the DOM typings but every major browser supports it
        webkitdirectory=""
        className="hidden"
        onChange={onFileChosen}
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
          <h1 className="truncate text-xl font-semibold text-text-primary">{room.name}</h1>
          <p className="text-sm text-text-secondary">
            {members.length} {members.length === 1 ? "person" : "people"} · {devices.length}{" "}
            {devices.length === 1 ? "device" : "devices"}
          </p>
        </div>
        {!room.isDefault && (
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
            {unreadCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-danger px-1 text-[10px] font-semibold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        )}
        {room.ownerId === user?.id && !room.isDefault && (
          <button
            onClick={deleteRoom}
            className="shrink-0 rounded-md p-2 text-text-secondary hover:bg-danger/10 hover:text-danger"
            aria-label="Delete room"
          >
            <Trash className="h-4 w-4" />
          </button>
        )}
        {room.ownerId !== user?.id && !room.isDefault && (
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

      {room.code && !room.isDefault && (
        <Card className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Invite someone to this room</p>
            <p className="mt-1 font-mono text-lg text-text-primary">{room.code}</p>
            <p className="mt-1 text-xs text-text-secondary">
              Anyone with this code can join and send files here.
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

      <SendBatchPanel batches={sendBatches} onDismiss={dismissBatch} />

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
              const isSending = sendingKey === device._id;
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
                    <div className="relative shrink-0">
                      <Button size="sm" variant="secondary" loading={isSending} onClick={() => openSendMenu(device)} className="gap-1.5">
                        <UploadSimple className="h-3.5 w-3.5" />
                        Send
                      </Button>
                      {openMenuKey === device._id && (
                        <SendDropdown onPickFiles={pickFiles} onPickFolder={pickFolder} onClose={() => setOpenMenuKey(null)} />
                      )}
                    </div>
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

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">People</h2>

        {room.ownerId === user?.id && (
          <form onSubmit={onInvite} className="mb-4 flex items-start gap-2">
            <div className="flex-1">
              <Input
                type="email"
                placeholder="Invite by email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
              {inviteError ? <p className="mt-1 text-xs text-danger">{inviteError}</p> : null}
            </div>
            <Button type="submit" variant="secondary" size="md" loading={inviting} className="shrink-0 gap-1.5">
              <PaperPlaneTilt className="h-3.5 w-3.5" />
              Invite
            </Button>
          </form>
        )}

        {members.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {members.map((member) => {
              const isSelf = member._id === user?.id;
              const canRemove = room.ownerId === user?.id && !isSelf;
              return (
                <div key={member._id} className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3">
                  <Avatar name={member.name} src={member.avatarUrl} className="h-6 w-6 text-xs" />
                  <span className="text-sm text-text-primary">{isSelf ? "You" : member.name}</span>
                  {canRemove && (
                    <button
                      onClick={() => onRemoveMember(member._id)}
                      disabled={removingId === member._id}
                      className="ml-1 rounded-full p-0.5 text-text-secondary hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                      aria-label={`Remove ${member.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
