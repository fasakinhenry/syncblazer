import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { zipSync } from "fflate";
import {
  ArrowLeft,
  ArrowsCounterClockwise,
  DownloadSimple,
  Eye,
  File as FileIcon,
  FolderOpen,
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

/** Consecutive files sharing the same batchId were sent together as one
 * multi-file/folder send (see PublicRoomPage's uploadChosen) — grouped so
 * the page can offer "download all" for them instead of one at a time. */
function groupByBatch(files: RoomFile[]): RoomFile[][] {
  const groups: RoomFile[][] = [];
  for (const file of files) {
    const last = groups[groups.length - 1];
    if (file.batchId && last?.[0].batchId === file.batchId) last.push(file);
    else groups.push([file]);
  }
  return groups;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
    api.roomFiles
      .list(roomId)
      .then(({ files }) => {
        setFiles(files);
        loadedOnce.current = true;
      })
      .catch(() => {
        if (!loadedOnce.current) toast("Couldn't load files right now. Pull to refresh and try again.", "error");
      })
      .finally(() => setLoading(false));
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

  const markDownloaded = (ids: Set<string>) => {
    setFiles((prev) =>
      prev.map((f) => (ids.has(f._id) ? { ...f, downloadedByMe: true, downloadCount: f.downloadCount + 1 } : f))
    );
  };

  const downloadFile = async (file: RoomFile) => {
    if (!roomId) return;
    setBusyId(file._id);
    try {
      const blob = await api.roomFiles.download(roomId, file._id);
      triggerDownload(blob, file.name);
      markDownloaded(new Set([file._id]));
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't download this file", "error");
    } finally {
      setBusyId(null);
    }
  };

  const downloadAll = async (group: RoomFile[]) => {
    if (!roomId || group.length < 2) return;
    const groupKey = group[0].batchId!;
    setBusyId(groupKey);
    try {
      const entries: Record<string, Uint8Array> = {};
      const usedNames = new Set<string>();
      for (const file of group) {
        const blob = await api.roomFiles.download(roomId, file._id);
        const buffer = new Uint8Array(await blob.arrayBuffer());
        // Two files in the same folder send can't collide (their relative
        // paths differ), but guard anyway rather than silently dropping
        // one entry if a name is ever repeated.
        let name = file.name;
        let suffix = 1;
        while (usedNames.has(name)) name = `${file.name} (${suffix++})`;
        usedNames.add(name);
        entries[name] = buffer;
      }
      const zipped = zipSync(entries);
      triggerDownload(new Blob([zipped], { type: "application/zip" }), `${room?.name ?? "files"}.zip`);
      markDownloaded(new Set(group.map((f) => f._id)));
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't download all of these files", "error");
    } finally {
      setBusyId(null);
    }
  };

  if (loading || !room) return <PageSpinner />;

  const groups = groupByBatch(files);

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
          {groups.map((group) => {
            if (group.length === 1) {
              const file = group[0];
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
            }

            const first = group[0];
            const isSelf = first.senderId === user?.id;
            const totalSize = group.reduce((sum, f) => sum + f.size, 0);
            const allDownloaded = group.every((f) => f.downloadedByMe);
            const isPrivate = first.visibility === "private";
            const privateToMe = isPrivate && first.recipientId === user?.id;
            const groupKey = first.batchId!;
            return (
              <Card key={groupKey} className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-text-secondary">
                    <FolderOpen className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Avatar name={first.senderName} src={first.senderAvatarUrl} className="h-5 w-5 text-[10px]" />
                      <p className="truncate text-sm text-text-secondary">
                        {isSelf ? "You" : first.senderName} · {formatRelativeTime(first.createdAt)}
                      </p>
                    </div>
                    <p className="mt-1 truncate font-medium text-text-primary">{group.length} files</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                      <span>{formatBytes(totalSize)}</span>
                      {isPrivate && (
                        <Badge tone="warning">
                          <Lock className="h-3 w-3" />
                          {privateToMe ? "Private to you" : isSelf ? "Private share" : "Private"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={allDownloaded ? "secondary" : "primary"}
                    loading={busyId === groupKey}
                    onClick={() => downloadAll(group)}
                    className="shrink-0 gap-1.5"
                  >
                    {allDownloaded ? <ArrowsCounterClockwise className="h-3.5 w-3.5" /> : <DownloadSimple className="h-3.5 w-3.5" />}
                    {allDownloaded ? "Redownload all" : "Download all"}
                  </Button>
                </div>

                <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {group.map((file) => (
                    <div key={file._id} className="flex items-center gap-3 px-3 py-2">
                      <FileIcon className="h-4 w-4 shrink-0 text-text-secondary" />
                      <p className="min-w-0 flex-1 truncate text-sm text-text-primary">{file.name}</p>
                      <span className="shrink-0 text-xs text-text-secondary">{formatBytes(file.size)}</span>
                      <button
                        onClick={() => toggleLike(file)}
                        className={`shrink-0 rounded-full p-1 transition-colors ${
                          file.likedByMe ? "text-danger" : "text-text-secondary hover:text-danger"
                        }`}
                        aria-label={file.likedByMe ? "Unlike" : "Like"}
                      >
                        <Heart weight={file.likedByMe ? "fill" : "regular"} className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => downloadFile(file)}
                        disabled={busyId === file._id}
                        className="shrink-0 rounded-md p-1 text-text-secondary hover:bg-surface-hover hover:text-brand disabled:opacity-50"
                        aria-label={`Download ${file.name}`}
                      >
                        {file.downloadedByMe ? <ArrowsCounterClockwise className="h-3.5 w-3.5" /> : <DownloadSimple className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
