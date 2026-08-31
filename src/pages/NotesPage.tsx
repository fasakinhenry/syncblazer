import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CloudArrowUp,
  DownloadSimple,
  FileText,
  MagnifyingGlass,
  Note as NoteIcon,
  Plus,
  ShareNetwork,
  Trash,
  WifiSlash,
} from "@phosphor-icons/react";
import { api } from "@/lib/api.ts";
import type { Note } from "@/lib/types.ts";
import { useRooms } from "@/context/RoomContext.tsx";
import { useSocket } from "@/context/SocketContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { useNotesSync } from "@/hooks/useNotesSync.ts";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback.ts";
import {
  cacheNote,
  cacheNotes,
  createLocalNoteId,
  getCachedNotes,
  isLocalNoteId,
  queuePendingCreate,
  queuePendingDelete,
  queuePendingUpdate,
  removeCachedNote,
} from "@/lib/notesOfflineStore.ts";
import { DEFAULT_NOTE_FONT } from "@/lib/noteFonts.ts";
import { downloadTextFile, markdownToPlainText, sanitizeFilename } from "@/lib/markdownToPlainText.ts";
import { NoteEditor } from "@/components/notes/NoteEditor.tsx";
import { ShareNoteModal } from "@/components/notes/ShareNoteModal.tsx";
import { NoteActivityPanel } from "@/components/notes/NoteActivityPanel.tsx";
import { LinkPreviewCards } from "@/components/notes/LinkPreviewCards.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { Badge } from "@/components/ui/Badge.tsx";

const REMOTE_APPLY_QUIET_MS = 3000; // only let a live remote update overwrite the editor after this long without local typing

export function NotesPage() {
  const { defaultRoom, rooms } = useRooms();
  const { socket } = useSocket();
  const { toast } = useToast();

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftFont, setDraftFont] = useState(DEFAULT_NOTE_FONT);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [remountKey, setRemountKey] = useState(0);

  const lastLocalEditAt = useRef(0);
  // Version we last saved or applied per note, so an echo of our own save
  // (the socket update it triggers, arriving a moment later) doesn't remount
  // the editor and jump the cursor for content we already have.
  const knownVersion = useRef<Record<string, string>>({});
  const exportRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => notes?.find((n) => n._id === selectedId) ?? null, [notes, selectedId]);
  const selectedRoom = useMemo(() => rooms.find((r) => r._id === selected?.roomId), [rooms, selected]);

  const reconcileLocalNote = useCallback((localId: string, note: Note) => {
    setNotes((prev) => prev?.map((n) => (n._id === localId ? note : n)) ?? null);
    setSelectedId((prev) => (prev === localId ? note._id : prev));
  }, []);

  const { online, pendingCount } = useNotesSync(reconcileLocalNote);

  const load = useCallback(async () => {
    try {
      const { notes: serverNotes } = await api.notes.list();
      await cacheNotes(serverNotes);
      // Anything still only in the offline queue (created while offline,
      // not yet synced) won't be in the server response — keep it visible.
      const cached = await getCachedNotes();
      const localOnly = cached.filter((n) => isLocalNoteId(n._id));
      setNotes([...localOnly, ...serverNotes]);
    } catch {
      const cached = await getCachedNotes();
      setNotes(cached);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    const onCreated = ({ note }: { note: Note }) => {
      setNotes((prev) => (prev?.some((n) => n._id === note._id) ? prev : prev ? [note, ...prev] : prev));
      void cacheNote(note);
    };
    const onUpdated = ({ note }: { note: Note }) => {
      void cacheNote(note);
      setNotes((prev) => prev?.map((n) => (n._id === note._id ? note : n)) ?? null);

      const isEcho = knownVersion.current[note._id] === note.updatedAt;
      const isOpenAndQuiet = note._id === selectedId && Date.now() - lastLocalEditAt.current > REMOTE_APPLY_QUIET_MS;
      if (!isEcho && isOpenAndQuiet) {
        knownVersion.current[note._id] = note.updatedAt;
        setDraftTitle(note.title);
        setDraftContent(note.content);
        setDraftFont(note.fontFamily);
        setRemountKey((k) => k + 1);
      }
    };
    const onDeleted = ({ noteId }: { noteId: string }) => {
      setNotes((prev) => prev?.filter((n) => n._id !== noteId) ?? null);
      void removeCachedNote(noteId);
      setSelectedId((prev) => (prev === noteId ? null : prev));
    };
    socket.on("note:created", onCreated);
    socket.on("note:updated", onUpdated);
    socket.on("note:deleted", onDeleted);
    return () => {
      socket.off("note:created", onCreated);
      socket.off("note:updated", onUpdated);
      socket.off("note:deleted", onDeleted);
    };
  }, [socket, selectedId]);

  useEffect(() => {
    if (!exportOpen) return;
    const onClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [exportOpen]);

  useEffect(() => {
    setDraftTitle(selected?.title ?? "");
    setDraftContent(selected?.content ?? "");
    setDraftFont(selected?.fontFamily ?? DEFAULT_NOTE_FONT);
  }, [selected]);

  const persist = useDebouncedCallback(async (noteId: string, patch: { title?: string; content?: string; fontFamily?: string }) => {
    setSaving(true);
    try {
      if (!online) {
        await queuePendingUpdate(noteId, patch);
        const merged = notes?.find((n) => n._id === noteId);
        if (merged) await cacheNote({ ...merged, ...patch });
        setNotes((prev) => prev?.map((n) => (n._id === noteId ? { ...n, ...patch } : n)) ?? null);
        return;
      }
      const { note } = await api.notes.update(noteId, patch);
      knownVersion.current[noteId] = note.updatedAt;
      await cacheNote(note);
      setNotes((prev) => prev?.map((n) => (n._id === noteId ? note : n)) ?? null);
    } catch {
      // Network hiccup mid-save — fall back to the offline queue so the edit isn't lost.
      await queuePendingUpdate(noteId, patch);
    } finally {
      setSaving(false);
    }
  }, 600);

  const onChangeTitle = (value: string) => {
    lastLocalEditAt.current = Date.now();
    setDraftTitle(value);
    if (selectedId) persist(selectedId, { title: value });
  };
  const onChangeContent = (markdown: string) => {
    lastLocalEditAt.current = Date.now();
    setDraftContent(markdown);
    if (selectedId) persist(selectedId, { content: markdown });
  };
  const onChangeFont = (fontFamily: string) => {
    setDraftFont(fontFamily);
    if (selectedId) persist(selectedId, { fontFamily });
  };

  const createNote = async () => {
    if (!defaultRoom) return;
    if (!online) {
      const localId = createLocalNoteId();
      const localNote: Note = {
        _id: localId,
        ownerId: "",
        roomId: defaultRoom._id,
        title: "Untitled note",
        content: "",
        fontFamily: DEFAULT_NOTE_FONT,
        visibility: "private",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await cacheNote(localNote);
      await queuePendingCreate(localId, {
        roomId: defaultRoom._id,
        title: localNote.title,
        content: "",
        visibility: "private",
        fontFamily: DEFAULT_NOTE_FONT,
      });
      setNotes((prev) => (prev ? [localNote, ...prev] : [localNote]));
      setSelectedId(localId);
      toast("Saved locally — will sync once you're back online", "info");
      return;
    }
    const { note } = await api.notes.create({ roomId: defaultRoom._id, title: "Untitled note" });
    await cacheNote(note);
    setNotes((prev) => (prev ? [note, ...prev] : [note]));
    setSelectedId(note._id);
  };

  const deleteNote = async (noteId: string) => {
    if (!window.confirm("Delete this note?")) return;
    setNotes((prev) => prev?.filter((n) => n._id !== noteId) ?? null);
    if (selectedId === noteId) setSelectedId(null);
    await removeCachedNote(noteId);

    if (isLocalNoteId(noteId)) {
      await queuePendingDelete(noteId);
      return;
    }
    if (!online) {
      await queuePendingDelete(noteId);
      return;
    }
    try {
      await api.notes.remove(noteId);
    } catch {
      await queuePendingDelete(noteId);
    }
  };

  const exportNote = (format: "md" | "txt") => {
    if (!selected) return;
    setExportOpen(false);
    const filename = `${sanitizeFilename(selected.title)}.${format}`;
    if (format === "md") {
      downloadTextFile(filename, `# ${selected.title}\n\n${draftContent}`, "text/markdown");
    } else {
      downloadTextFile(filename, `${selected.title}\n\n${markdownToPlainText(draftContent)}`, "text/plain");
    }
  };

  const filteredNotes = useMemo(() => {
    if (!notes) return [];
    const term = search.trim().toLowerCase();
    if (!term) return notes;
    return notes
      .map((n) => {
        const titleHit = n.title.toLowerCase().includes(term);
        const contentHit = n.content.toLowerCase().includes(term);
        if (!titleHit && !contentHit) return null;
        return { note: n, score: titleHit ? 2 : 1 };
      })
      .filter((x): x is { note: Note; score: number } => !!x)
      .sort((a, b) => b.score - a.score || b.note.updatedAt.localeCompare(a.note.updatedAt))
      .map((x) => x.note);
  }, [notes, search]);

  if (notes === null) return <PageSpinner />;

  return (
    <div className="flex h-full min-h-[70vh] gap-6">
      <div className={`flex w-full flex-col gap-4 md:w-80 md:shrink-0 ${selected ? "hidden md:flex" : "flex"}`}>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-text-primary">Notes</h1>
          <Button size="sm" onClick={createNote} disabled={!defaultRoom} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>

        {(!online || pendingCount > 0) && (
          <div className="flex items-center gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            {!online ? <WifiSlash className="h-3.5 w-3.5" /> : <CloudArrowUp className="h-3.5 w-3.5" />}
            {!online
              ? "Offline — changes are saved on this device and will sync automatically."
              : `Syncing ${pendingCount} change${pendingCount === 1 ? "" : "s"}…`}
          </div>
        )}

        <div className="relative">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <Input placeholder="Search notes" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {filteredNotes.length === 0 ? (
          <EmptyState
            icon={<NoteIcon className="h-8 w-8" />}
            title={search ? "No matches" : "No notes yet"}
            description={search ? "Try a different search." : "Capture something you'll want everywhere."}
            action={
              !search ? (
                <Button onClick={createNote} disabled={!defaultRoom}>
                  New note
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {filteredNotes.map((note) => (
              <button
                key={note._id}
                onClick={() => setSelectedId(note._id)}
                className={`flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  selectedId === note._id ? "bg-brand-soft" : "hover:bg-surface-hover"
                }`}
              >
                <span className="flex items-center gap-1.5 truncate font-medium text-text-primary">
                  {note.title || "Untitled note"}
                  {isLocalNoteId(note._id) && (
                    <span className="shrink-0 text-text-secondary" title="Not yet synced">
                      <CloudArrowUp className="h-3 w-3" />
                    </span>
                  )}
                  {note.visibility === "room" && <Badge tone="brand">Shared</Badge>}
                </span>
                <span className="truncate text-xs text-text-secondary">
                  {markdownToPlainText(note.content).slice(0, 60) || "No content"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`flex-1 flex-col ${selected ? "flex" : "hidden md:flex"}`}>
        {selected ? (
          <div className="flex h-full flex-col gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedId(null)}
                className="rounded-md p-2 text-text-secondary hover:bg-surface-hover md:hidden"
                aria-label="Back to notes"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <input
                value={draftTitle}
                onChange={(e) => onChangeTitle(e.target.value)}
                placeholder="Untitled note"
                className="flex-1 bg-transparent font-display text-lg font-semibold text-text-primary outline-none"
              />
              <span className="shrink-0 text-xs text-text-secondary">{saving ? "Saving…" : "Saved"}</span>

              <button
                onClick={() => setShareOpen(true)}
                aria-label="Share note"
                className="shrink-0 rounded-md p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              >
                <ShareNetwork className="h-4 w-4" />
              </button>

              <div ref={exportRef} className="relative shrink-0">
                <button
                  onClick={() => setExportOpen((o) => !o)}
                  aria-label="Export note"
                  className="rounded-md p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  <DownloadSimple className="h-4 w-4" />
                </button>
                {exportOpen && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-border bg-surface py-1 shadow-lg">
                    <button
                      onClick={() => exportNote("md")}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover"
                    >
                      <FileText className="h-4 w-4" />
                      Save as Markdown (.md)
                    </button>
                    <button
                      onClick={() => exportNote("txt")}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover"
                    >
                      <FileText className="h-4 w-4" />
                      Save as text (.txt)
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => deleteNote(selected._id)}
                aria-label="Delete note"
                className="shrink-0 rounded-md p-2 text-text-secondary hover:bg-danger/10 hover:text-danger"
              >
                <Trash className="h-4 w-4" />
              </button>
            </div>

            <NoteEditor
              key={`${selected._id}:${remountKey}`}
              noteId={selected._id}
              initialContent={draftContent}
              fontFamily={draftFont}
              editable
              onUpdateMarkdown={onChangeContent}
              onFontChange={onChangeFont}
            />

            <LinkPreviewCards markdown={draftContent} />
            {selectedRoom && <NoteActivityPanel noteId={selected._id} roomId={selected.roomId} />}

            {shareOpen && (
              <ShareNoteModal
                open={shareOpen}
                onClose={() => setShareOpen(false)}
                note={selected}
                roomName={selectedRoom?.name ?? "this room"}
                onUpdated={(note) => {
                  void cacheNote(note);
                  setNotes((prev) => prev?.map((n) => (n._id === note._id ? note : n)) ?? null);
                }}
              />
            )}
          </div>
        ) : (
          <EmptyState title="Select a note" description="Choose a note from the list, or create a new one." />
        )}
      </div>
    </div>
  );
}
