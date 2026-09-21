import { CheckCircle, File as FileIcon, WarningCircle, X } from "@phosphor-icons/react";
import { formatBytes } from "@/lib/format.ts";
import { Card } from "@/components/ui/Card.tsx";
import { Button } from "@/components/ui/Button.tsx";

export interface SendBatchFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

export interface SendBatch {
  id: string;
  targetLabel: string;
  files: SendBatchFile[];
}

/** A temporary "here's what's sending right now" panel — every file in a
 * batch gets its own progress bar, so picking a folder full of files (or
 * just several at once) never again looks like nothing happened after the
 * picker closes. Shared by every room's send flow. `onViewFiles` is
 * omitted for room kinds with no Files tab (only public rooms have one). */
export function SendBatchPanel({
  batches,
  onDismiss,
  onViewFiles,
}: {
  batches: SendBatch[];
  onDismiss: (batchId: string) => void;
  onViewFiles?: () => void;
}) {
  if (batches.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-text-secondary">Sending</h2>
      <div className="flex flex-col gap-3">
        {batches.map((batch) => {
          const allSettled = batch.files.every((f) => f.status !== "uploading");
          const anyError = batch.files.some((f) => f.status === "error");
          return (
            <Card key={batch.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-text-primary">
                  Sending to <span className="font-medium">{batch.targetLabel}</span>
                </p>
                <div className="flex items-center gap-2">
                  {allSettled && !anyError && onViewFiles && (
                    <Button size="sm" variant="secondary" onClick={onViewFiles} className="gap-1.5">
                      <FileIcon className="h-3.5 w-3.5" />
                      View in Files
                    </Button>
                  )}
                  <button
                    onClick={() => onDismiss(batch.id)}
                    aria-label="Dismiss"
                    className="rounded-md p-1 text-text-secondary hover:bg-surface-hover"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                {batch.files.map((file) => (
                  <div key={file.id} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-text-secondary">
                      {file.status === "done" ? (
                        <CheckCircle className="h-4 w-4 text-success" weight="fill" />
                      ) : file.status === "error" ? (
                        <WarningCircle className="h-4 w-4 text-danger" weight="fill" />
                      ) : (
                        <FileIcon className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text-primary">{file.name}</p>
                      {file.status === "error" ? (
                        <p className="text-xs text-danger">{file.error ?? "Failed to send"}</p>
                      ) : (
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
                          <div
                            className={`h-full rounded-full transition-all ${file.status === "done" ? "bg-success" : "bg-brand"}`}
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-text-secondary">{formatBytes(file.size)}</span>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
