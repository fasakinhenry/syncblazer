import { get, set, del, keys } from "idb-keyval";
import type { Note, NoteVisibility } from "@/lib/types.ts";

const CACHE_PREFIX = "syncblaze.note-cache:";
const PENDING_PREFIX = "syncblaze.note-pending:";

export type NotePatch = Partial<Pick<Note, "title" | "content" | "visibility" | "fontFamily">>;

export type PendingOp =
  | { type: "create"; localId: string; roomId: string; title: string; content: string; visibility: NoteVisibility; fontFamily: string }
  | { type: "update"; noteId: string; patch: NotePatch }
  | { type: "delete"; noteId: string };

async function stringKeys(prefix: string): Promise<string[]> {
  const all = await keys();
  return all.filter((k): k is string => typeof k === "string" && k.startsWith(prefix));
}

// --- Read-through cache: every note ever loaded stays available offline ---

export async function cacheNote(note: Note): Promise<void> {
  await set(CACHE_PREFIX + note._id, note);
}

export async function cacheNotes(notes: Note[]): Promise<void> {
  await Promise.all(notes.map(cacheNote));
}

export async function getCachedNotes(): Promise<Note[]> {
  const noteKeys = await stringKeys(CACHE_PREFIX);
  const notes = await Promise.all(noteKeys.map((k) => get<Note>(k)));
  return notes.filter((n): n is Note => !!n).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function removeCachedNote(noteId: string): Promise<void> {
  await del(CACHE_PREFIX + noteId);
}

// --- Pending queue: one slot per note, later writes coalesce into it ---

function pendingKey(id: string) {
  return PENDING_PREFIX + id;
}

export async function queuePendingCreate(
  localId: string,
  input: { roomId: string; title: string; content: string; visibility: NoteVisibility; fontFamily: string }
): Promise<void> {
  await set(pendingKey(localId), { type: "create", localId, ...input } satisfies PendingOp);
}

export async function queuePendingUpdate(noteId: string, patch: NotePatch): Promise<void> {
  const key = pendingKey(noteId);
  const existing = await get<PendingOp>(key);

  if (existing?.type === "create") {
    // Not synced yet at all — fold the edit into the not-yet-sent create.
    await set(key, { ...existing, ...patch });
    return;
  }
  if (existing?.type === "update") {
    await set(key, { type: "update", noteId, patch: { ...existing.patch, ...patch } } satisfies PendingOp);
    return;
  }
  await set(key, { type: "update", noteId, patch } satisfies PendingOp);
}

export async function queuePendingDelete(noteId: string): Promise<void> {
  const key = pendingKey(noteId);
  const existing = await get<PendingOp>(key);
  if (existing?.type === "create") {
    // Created and deleted before ever reaching the server — nothing to send.
    await del(key);
    return;
  }
  await set(key, { type: "delete", noteId } satisfies PendingOp);
}

export async function getPendingOps(): Promise<PendingOp[]> {
  const pendingKeys = await stringKeys(PENDING_PREFIX);
  const ops = await Promise.all(pendingKeys.map((k) => get<PendingOp>(k)));
  return ops.filter((op): op is PendingOp => !!op);
}

export async function getPendingCount(): Promise<number> {
  return (await stringKeys(PENDING_PREFIX)).length;
}

export async function clearPendingOp(id: string): Promise<void> {
  await del(pendingKey(id));
}

export function isLocalNoteId(id: string): boolean {
  return id.startsWith("local-");
}

export function createLocalNoteId(): string {
  return `local-${crypto.randomUUID()}`;
}
