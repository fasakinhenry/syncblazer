import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/api.ts";
import { useOnlineStatus } from "@/hooks/useOnlineStatus.ts";
import { cacheNote, clearPendingOp, getPendingOps, getPendingCount, removeCachedNote } from "@/lib/notesOfflineStore.ts";
import type { Note } from "@/lib/types.ts";

/** Flushes queued offline note edits once a connection is back, and
 * reconciles any notes that were created while offline (temp local id ->
 * real server id) back into the caller's state. */
export function useNotesSync(onReconciled: (localId: string, note: Note) => void) {
  const online = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const flushingRef = useRef(false);
  const onReconciledRef = useRef(onReconciled);
  onReconciledRef.current = onReconciled;

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await getPendingCount());
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current || !navigator.onLine) return;
    flushingRef.current = true;
    try {
      const ops = await getPendingOps();
      for (const op of ops) {
        try {
          if (op.type === "create") {
            const { note } = await api.notes.create({
              roomId: op.roomId,
              title: op.title,
              content: op.content,
              visibility: op.visibility,
              fontFamily: op.fontFamily,
            });
            await cacheNote(note);
            await removeCachedNote(op.localId).catch(() => undefined);
            await clearPendingOp(op.localId);
            onReconciledRef.current(op.localId, note);
          } else if (op.type === "update") {
            const { note } = await api.notes.update(op.noteId, op.patch);
            await cacheNote(note);
            await clearPendingOp(op.noteId);
          } else if (op.type === "delete") {
            try {
              await api.notes.remove(op.noteId);
            } catch (err) {
              if (!(err instanceof ApiClientError && err.status === 404)) throw err;
            }
            await removeCachedNote(op.noteId);
            await clearPendingOp(op.noteId);
          }
        } catch {
          // Leave this one queued; the rest still get a chance, and everything
          // still pending gets retried on the next flush.
        }
      }
    } finally {
      flushingRef.current = false;
      await refreshPendingCount();
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    if (online) void flush();
  }, [online, flush]);

  return { online, pendingCount, flush };
}
