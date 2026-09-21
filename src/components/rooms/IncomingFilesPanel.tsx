import { useState } from "react";
import { ArrowsCounterClockwise, DownloadSimple, File as FileIcon, Lock, Spinner, X } from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api.ts";
import type { RoomFile } from "@/lib/types.ts";
import { useToast } from "@/context/ToastContext.tsx";
import { downloadRoomFilesAsZip, triggerDownload } from "@/lib/downloadBatch.ts";
import { formatBytes } from "@/lib/format.ts";
import { Avatar } from "@/components/Avatar.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Badge } from "@/components/ui/Badge.tsx";

export interface IncomingBatch {
  /** batchId for a multi-file send, or the lone file's own id otherwise. */
  key: string;
  files: RoomFile[];
  /** False while more files for this same batch might still be arriving
   * (see PublicRoomPage's debounce) — "Download all" only appears once
   * true, but every already-arrived file can still be downloaded on its
   * own in the meantime. */
  complete: boolean;
}

/** Room-scoped — unlike the sender's own SendBatchPanel (which only ever
 * shows your own outgoing sends), this is what a receiver sees for
 * everyone else's incoming files while a public room's page is open.
 * Purely component state in PublicRoomPage, so navigating away clears it
 * — nothing here is meant to persist like the Files page does. */
export function IncomingFilesPanel({
  roomId,
  batches,
  onDismiss,
  onFileDownloaded,
}: {
  roomId: string;
  batches: IncomingBatch[];
  onDismiss: (key: string) => void;
  onFileDownloaded: (fileIds: string[]) => void;
}) {
  const { toast } = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (batches.length === 0) return null;

  const downloadOne = async (file: RoomFile) => {
    setBusyKey(file._id);
    try {
      const blob = await api.roomFiles.download(roomId, file._id);
      triggerDownload(blob, file.name);
      onFileDownloaded([file._id]);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't download this file", "error");
    } finally {
      setBusyKey(null);
    }
  };

  const downloadAll = async (batch: IncomingBatch) => {
    setBusyKey(batch.key);
    try {
      await downloadRoomFilesAsZip(roomId, batch.files, "files.zip");
      onFileDownloaded(batch.files.map((f) => f._id));
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't download all of these files", "error");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-text-secondary">Receiving</h2>
      <div className="flex flex-col gap-3">
        {batches.map((batch) => {
          const first = batch.files[0];
          const isMulti = batch.files.length > 1;
          const totalSize = batch.files.reduce((sum, f) => sum + f.size, 0);
          const allDownloaded = batch.files.every((f) => f.downloadedByMe);
          const isPrivate = first.visibility === "private";

          return (
            <Card key={batch.key} className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={first.senderName} src={first.senderAvatarUrl} className="h-9 w-9 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-primary">
                    <span className="font-medium">{first.senderName}</span> sent {isMulti ? `${batch.files.length} files` : "a file"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                    {!batch.complete ? (
                      <span className="flex items-center gap-1">
                        <Spinner className="h-3 w-3 animate-spin" />
                        Still receiving…
                      </span>
                    ) : (
                      <span>{formatBytes(totalSize)}</span>
                    )}
                    {isPrivate && (
                      <Badge tone="warning">
                        <Lock className="h-3 w-3" />
                        Private
                      </Badge>
                    )}
                  </div>
                </div>
                {isMulti && batch.complete && (
                  <Button
                    size="sm"
                    variant={allDownloaded ? "secondary" : "primary"}
                    loading={busyKey === batch.key}
                    onClick={() => downloadAll(batch)}
                    className="shrink-0 gap-1.5"
                  >
                    {allDownloaded ? <ArrowsCounterClockwise className="h-3.5 w-3.5" /> : <DownloadSimple className="h-3.5 w-3.5" />}
                    {allDownloaded ? "Redownload all" : "Download all"}
                  </Button>
                )}
                <button
                  onClick={() => onDismiss(batch.key)}
                  aria-label="Dismiss"
                  className="shrink-0 rounded-md p-1 text-text-secondary hover:bg-surface-hover"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {isMulti ? (
                <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {batch.files.map((file) => (
                    <div key={file._id} className="flex items-center gap-3 px-3 py-2">
                      <FileIcon className="h-4 w-4 shrink-0 text-text-secondary" />
                      <p className="min-w-0 flex-1 truncate text-sm text-text-primary">{file.name}</p>
                      {file.downloadedByMe && <Badge tone="success">Downloaded</Badge>}
                      <span className="shrink-0 text-xs text-text-secondary">{formatBytes(file.size)}</span>
                      <button
                        onClick={() => downloadOne(file)}
                        disabled={busyKey === file._id}
                        className="shrink-0 rounded-md p-1 text-text-secondary hover:bg-surface-hover hover:text-brand disabled:opacity-50"
                        aria-label={file.downloadedByMe ? `Redownload ${file.name}` : `Download ${file.name}`}
                      >
                        {file.downloadedByMe ? <ArrowsCounterClockwise className="h-3.5 w-3.5" /> : <DownloadSimple className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={first.downloadedByMe ? "secondary" : "primary"}
                    loading={busyKey === first._id}
                    onClick={() => downloadOne(first)}
                    className="gap-1.5"
                  >
                    {first.downloadedByMe ? <ArrowsCounterClockwise className="h-3.5 w-3.5" /> : <DownloadSimple className="h-3.5 w-3.5" />}
                    {first.downloadedByMe ? "Redownload" : "Download"}
                  </Button>
                  {first.downloadedByMe && <Badge tone="success">Downloaded</Badge>}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
