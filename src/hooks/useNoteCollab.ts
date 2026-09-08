import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import { useSocket } from "@/context/SocketContext.tsx";
import { useAuth } from "@/context/AuthContext.tsx";
import { seedYDocFromMarkdown, NOTE_YJS_FIELD } from "@/lib/noteYjsSeed.ts";

const PRESENCE_COLORS = ["#f97316", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#eab308"];

function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length];
}

export interface CollabPresence {
  clientId: number;
  name: string;
  color: string;
}

export interface NoteWatcher {
  userId: string;
  name: string;
  avatarUrl?: string;
  canEdit: boolean;
}

export interface NoteCollabHandle {
  doc: Y.Doc;
  awareness: Awareness;
  /** True once the server's initial state for this note has been applied
   * (including seeding a legacy note from its markdown, if it needed it).
   * The real-time editor should stay in plain-content mode until this
   * flips — switching to Yjs before we know what the server has risks
   * seeding on top of content that was about to arrive. Only ever true for
   * someone with write access — a read-only watcher never gets the Yjs doc. */
  ready: boolean;
  /** Live cursors — only populated for other people who can also edit,
   * since read-only watchers never join the Yjs layer at all. */
  presence: CollabPresence[];
  /** Everyone currently watching this note, readers and editors alike —
   * capped server-side to the first 25; `totalWatchers` is the real count
   * for a "+N" overflow indicator when it's more than the UI shows. */
  watchers: NoteWatcher[];
  totalWatchers: number;
  /** The caret extension needs the local user's own name/color up front —
   * computed the same way the awareness state below is, so there's one
   * source of truth instead of the caller re-deriving it separately. */
  localUser: { name: string; color: string };
}

/** Owns a note's live Yjs document + awareness (cursor/presence) state and
 * keeps it synced over the existing Socket.IO connection via a small
 * custom relay (see backend/src/sockets/noteCollab.ts) — deliberately not
 * y-websocket, no separate server needed. Returns null while there's no
 * note selected or no live connection to sync over; callers should fall
 * back to the plain markdown-content editor in that case (see
 * NoteEditor.tsx) rather than editing an un-synced, about-to-be-replaced
 * Yjs doc. */
export function useNoteCollab(noteId: string | null, initialMarkdown: string): NoteCollabHandle | null {
  const { socket, connected } = useSocket();
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [presence, setPresence] = useState<CollabPresence[]>([]);
  const [watchers, setWatchers] = useState<NoteWatcher[]>([]);
  const [totalWatchers, setTotalWatchers] = useState(0);
  const seededRef = useRef(false);
  const initialMarkdownRef = useRef(initialMarkdown);
  initialMarkdownRef.current = initialMarkdown;

  const doc = useMemo(() => new Y.Doc(), [noteId]);
  const awareness = useMemo(() => new Awareness(doc), [doc]);
  const localUser = useMemo(
    () => ({ name: user?.name ?? "Someone", color: colorForUser(user?.id ?? "anon") }),
    [user]
  );

  useEffect(() => {
    setReady(false);
    setPresence([]);
    setWatchers([]);
    setTotalWatchers(0);
    seededRef.current = false;
  }, [noteId]);

  useEffect(() => {
    if (!socket || !connected || !noteId) return;
    let cancelled = false;

    const onState = (payload: { noteId: string; state: ArrayBuffer | Uint8Array }) => {
      if (payload.noteId !== noteId || cancelled) return;
      const bytes = payload.state instanceof Uint8Array ? payload.state : new Uint8Array(payload.state);
      Y.applyUpdate(doc, bytes, "remote");

      if (!seededRef.current && doc.getXmlFragment(NOTE_YJS_FIELD).length === 0 && initialMarkdownRef.current.trim()) {
        seededRef.current = true;
        seedYDocFromMarkdown(doc, initialMarkdownRef.current);
      }
      setReady(true);
    };

    const onUpdate = (payload: { noteId: string; update: ArrayBuffer | Uint8Array }) => {
      if (payload.noteId !== noteId || cancelled) return;
      const bytes = payload.update instanceof Uint8Array ? payload.update : new Uint8Array(payload.update);
      Y.applyUpdate(doc, bytes, "remote");
    };

    const onAwareness = (payload: { noteId: string; update: ArrayBuffer | Uint8Array }) => {
      if (payload.noteId !== noteId || cancelled) return;
      const bytes = payload.update instanceof Uint8Array ? payload.update : new Uint8Array(payload.update);
      applyAwarenessUpdate(awareness, bytes, "remote");
    };

    const onWatchers = (payload: { noteId: string; watchers: NoteWatcher[]; total: number }) => {
      if (payload.noteId !== noteId || cancelled) return;
      setWatchers(payload.watchers);
      setTotalWatchers(payload.total);
    };

    socket.on("note:collab:state", onState);
    socket.on("note:collab:update", onUpdate);
    socket.on("note:collab:awareness", onAwareness);
    socket.on("note:watchers", onWatchers);
    socket.emit("note:collab:join", { noteId });

    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      socket.emit("note:collab:update", { noteId, update });
    };
    doc.on("update", onDocUpdate);

    const onAwarenessChange = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      const changed = [...added, ...updated, ...removed];
      if (changed.length === 0) return;
      socket.emit("note:collab:awareness", { noteId, update: encodeAwarenessUpdate(awareness, changed) });
    };
    awareness.on("update", onAwarenessChange);

    awareness.setLocalStateField("user", localUser);

    const onAwarenessStates = () => {
      const states = [...awareness.getStates().entries()]
        .filter(([clientId]) => clientId !== awareness.clientID)
        .map(([clientId, state]) => ({
          clientId,
          name: (state.user?.name as string) ?? "Someone",
          color: (state.user?.color as string) ?? "#94a3b8",
        }));
      setPresence(states);
    };
    awareness.on("change", onAwarenessStates);

    return () => {
      cancelled = true;
      socket.off("note:collab:state", onState);
      socket.off("note:collab:update", onUpdate);
      socket.off("note:collab:awareness", onAwareness);
      socket.off("note:watchers", onWatchers);
      doc.off("update", onDocUpdate);
      awareness.off("update", onAwarenessChange);
      awareness.off("change", onAwarenessStates);
      removeAwarenessStates(awareness, [awareness.clientID], "local");
      socket.emit("note:collab:leave", { noteId });
    };
  }, [socket, connected, noteId, doc, awareness, localUser]);

  useEffect(() => {
    return () => {
      awareness.destroy();
      doc.destroy();
    };
  }, [doc, awareness]);

  if (!noteId) return null;
  return { doc, awareness, ready, presence, watchers, totalWatchers, localUser };
}
