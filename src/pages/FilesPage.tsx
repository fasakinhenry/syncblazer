import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowsCounterClockwise,
  DownloadSimple,
  Eye,
  File as FileIcon,
  Heart,
  Lock,
} from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api.ts";
import type { Room, RoomFile } from "@/lib/types.ts";
import { useAuth } from "@/context/AuthContext.tsx";
import { useSocket } from "@/context/SocketContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { formatBytes, formatRelativeTime } from "@/lib/format.ts";
import { Avatar } from "@/components/Avatar.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Badge } from "@/components/ui/Badge.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";

function isImage(mimeType?: string): boolean {
  return !!mimeType && mimeType.startsWith("image/");
}

function FileThumbnail({ roomId, file }: { roomId: string; file: RoomFile }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage(file.mimeType)) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    api.roomFiles.preview(roomId, file._id).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [roomId, file._id, file.mimeType]);

  if (!isImage(file.mimeType)) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-text-secondary">
        <FileIcon className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-hover">
      {src ? <img src={src} alt={file.name} className="h-full w-full object-cover" /> : null}
    </div>
  );
}

export function FilesPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const { toast } = useToast();

  const [room, setRoom] = useState<Room | null>(null);
  const [files, setFiles] = useState<RoomFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const loadFiles = () => {
    if (!roomId) return;
    api.roomFiles.list(roomId).then(({ files }) => {
      setFiles(files);
      setLoading(false);
      loadedOnce.current = true;
    });
  };

  useEffect(() => {
    if (!roomId) return;
    api.rooms.get(roomId).then(({ room }) => setRoom(room));
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (!socket || !roomId) return;
    socket.emit("room:join", roomId);
    const onFileShared = () => loadFiles();
    socket.on("room:file-shared", onFileShared);
    return () => {
      socket.off("room:file-shared", onFileShared);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, roomId]);

  const toggleLike = async (file: RoomFile) => {
    if (!roomId) return;
    setFiles((prev) =>
      prev.map((f) =>
        f._id === file._id ? { ...f, likedByMe: !f.likedByMe, likeCount: f.likeCount + (f.likedByMe ? -1 : 1) } : f
      )
    );
    try {
      if (file.likedByMe) await api.roomFiles.unlike(roomId, file._id);
      else await api.roomFiles.like(roomId, file._id);
    } catch {
      loadFiles();
    }
  };

  const downloadFile = async (file: RoomFile) => {
    if (!roomId) return;
    setBusyId(file._id);
    try {
      const blob = await api.roomFiles.download(roomId, file._id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      setFiles((prev) => prev.map((f) => (f._id === file._id ? { ...f, downloadedByMe: true, downloadCount: f.downloadCount + 1 } : f)));
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't download this file", "error");
    } finally {
      setBusyId(null);
    }
  };

  if (loading || !room) return <PageSpinner />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/rooms/${roomId}`)}
          className="rounded-md p-2 text-text-secondary hover:bg-surface-hover"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-text-primary">Files</h1>
          <p className="text-sm text-text-secondary">Everything shared in {room.name}</p>
        </div>
      </div>

      {files.length === 0 ? (
        <EmptyState
          title="No files yet"
          description="Anything sent to this room, to a person, or to a specific device shows up here so it can be grabbed anytime."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {files.map((file) => {
            const isSelf = file.senderId === user?.id;
            const isPrivate = file.visibility === "private";
            const privateToMe = isPrivate && file.recipientId === user?.id;
            return (
              <Card key={file._id} className="flex items-center gap-3 p-4">
                <FileThumbnail roomId={roomId!} file={file} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Avatar name={file.senderName} src={file.senderAvatarUrl} className="h-5 w-5 text-[10px]" />
                    <p className="truncate text-sm text-text-secondary">
                      {isSelf ? "You" : file.senderName} · {formatRelativeTime(file.createdAt)}
                    </p>
                  </div>
                  <p className="mt-1 truncate font-medium text-text-primary">{file.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                    <span>{formatBytes(file.size)}</span>
                    {isPrivate && (
                      <Badge tone="warning">
                        <Lock className="h-3 w-3" />
                        {privateToMe ? "Private to you" : isSelf ? "Private share" : "Private"}
                      </Badge>
                    )}
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {file.viewCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <DownloadSimple className="h-3 w-3" />
                      {file.downloadCount}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Button
                    size="sm"
                    variant={file.downloadedByMe ? "secondary" : "primary"}
                    loading={busyId === file._id}
                    onClick={() => downloadFile(file)}
                    className="gap-1.5"
                  >
                    {file.downloadedByMe ? <ArrowsCounterClockwise className="h-3.5 w-3.5" /> : <DownloadSimple className="h-3.5 w-3.5" />}
                    {file.downloadedByMe ? "Redownload" : "Download"}
                  </Button>
                  <button
                    onClick={() => toggleLike(file)}
                    className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors ${
                      file.likedByMe ? "text-danger" : "text-text-secondary hover:text-danger"
                    }`}
                  >
                    <Heart weight={file.likedByMe ? "fill" : "regular"} className="h-4 w-4" />
                    {file.likeCount > 0 ? file.likeCount : ""}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
