import { zipSync } from "fflate";
import { api } from "@/lib/api.ts";
import type { RoomFile } from "@/lib/types.ts";

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Consecutive files sharing the same batchId were sent together as one
 * multi-file/folder send (see PublicRoomPage's uploadChosen) — grouped so
 * a page can offer "download all" for them instead of one at a time. */
export function groupByBatch(files: RoomFile[]): RoomFile[][] {
  const groups: RoomFile[][] = [];
  for (const file of files) {
    const last = groups[groups.length - 1];
    if (file.batchId && last?.[0].batchId === file.batchId) last.push(file);
    else groups.push([file]);
  }
  return groups;
}

/** Fetches every file in a batch and bundles them into one .zip rather
 * than making the recipient click Download once per file — a file's
 * folder-relative path (tracked separately from its display name, see
 * fileUtils.ts's relativePathOf) becomes its path inside the zip when it
 * has one, so a folder send's structure comes back intact; anything
 * without one (a plain multi-file pick) just uses its plain name.
 * Shared by the Files page and the room-scoped "incoming files" panel so
 * both offer the exact same "download all" behavior. */
export async function downloadRoomFilesAsZip(roomId: string, files: RoomFile[], zipName: string): Promise<void> {
  const entries: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();
  for (const file of files) {
    const blob = await api.roomFiles.download(roomId, file._id);
    const buffer = new Uint8Array(await blob.arrayBuffer());
    // Two files from the same folder send can't collide (their relative
    // paths differ), but guard anyway rather than silently dropping one
    // entry if a name is ever repeated.
    let name = file.relativePath || file.name;
    let suffix = 1;
    while (usedNames.has(name)) name = `${file.name} (${suffix++})`;
    usedNames.add(name);
    entries[name] = buffer;
  }
  const zipped = zipSync(entries);
  triggerDownload(new Blob([zipped], { type: "application/zip" }), zipName);
}
