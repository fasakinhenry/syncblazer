import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckSquare,
  CloudArrowUp,
  DownloadSimple,
  FileText,
  FloppyDisk,
  Globe,
  MagnifyingGlass,
  Note as NoteIcon,
  Plus,
  ShareNetwork,
  Square,
  Trash,
  WifiSlash,
  X,
} from "@phosphor-icons/react";
import { api } from "@/lib/api.ts";
import type { Note } from "@/lib/types.ts";
import { useRooms } from "@/context/RoomContext.tsx";
import { useSocket } from "@/context/SocketContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { useNotesSync } from "@/hooks/useNotesSync.ts";
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const lastLocalEditAt = useRef(0);
  // Version we last saved or applied per note, so an echo of our own save
  // (the socket update it triggers, arriving a moment later) doesn't remount
  // the editor and jump the cursor for content we already have.
  const knownVersion = useRef<Record<string, string>>({});
  const exportRef = useRef<HTMLDivElement>(null);
  // One debounce timer + merged patch PER NOTE — not a single shared slot.
  // A shared slot meant a content edit arriving before a font edit's 600ms
  // elapsed would cancel and replace it outright, silently dropping the
  // font change (and the same for switching notes mid-debounce).
  const pendingPatchRef = useRef<Record<string, { title?: string; content?: string; fontFamily?: string }>>({});
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Only ever one save request in flight per note. Without this, two lulls
  // in typing close together can fire two overlapping PATCH requests for
  // the same note, and if the network reorders their responses the OLDER
  // one can land last and silently overwrite newer content. A queued
  // rerun (using whatever's freshly merged into pendingPatchRef by then)
  // replaces the second request instead of racing it.
  const inFlightRef = useRef<Record<string, boolean>>({});
  const rerunRef = useRef<Record<string, boolean>>({});
  const notesRef = useRef<Note[] | null>(null);
  notesRef.current = notes;

  const selected = useMemo(() => notes?.find((n) => n._id === selectedId) ?? null, [notes, selectedId]);
  const selectedRoom = useMemo(() => rooms.find((r) => r._id === selected?.roomId), [rooms, selected]);

  const reconcileLocalNote = useCallback((localId: string, note: Note) => {
    setNotes((prev) => prev?.map((n) => (n._id === localId ? note : n)) ?? null);
    setSelectedId((prev) => (prev === localId ? note._id : prev));
  }, []);

  const { online, pendingCount, flush: syncFlush } = useNotesSync(reconcileLocalNote);

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

  // Deliberately keyed on selectedId, not on `selected` (which gets a new
  // object reference on every notes-array mutation, including the echo of
  // our OWN save landing back in state). Depending on `selected` meant this
  // effect fired after every autosave too — and if the user had typed more
  // while that save's request was still in flight, it would stomp the
  // editor's draft state back to the older, just-saved value, discarding
  // keystrokes that happened in between. Only actually switching notes
  // should reinitialize the draft from stored state.
  useEffect(() => {
    const note = notesRef.current?.find((n) => n._id === selectedId) ?? null;
    setDraftTitle(note?.title ?? "");
    setDraftContent(note?.content ?? "");
    setDraftFont(note?.fontFamily ?? DEFAULT_NOTE_FONT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const flushPersist = useCallback(
    async (noteId: string) => {
      if (saveTimersRef.current[noteId]) {
        clearTimeout(saveTimersRef.current[noteId]);
        delete saveTimersRef.current[noteId];
      }

      // A save for this note is already in flight — don't fire a second,
      // overlapping request (that's how an older response can land after a
      // newer one and clobber it). Ask that request to run again once it's
      // done instead, picking up whatever's freshly merged by then.
      if (inFlightRef.current[noteId]) {
        rerunRef.current[noteId] = true;
        return;
      }

      const patch = pendingPatchRef.current[noteId];
      if (!patch) return;
      delete pendingPatchRef.current[noteId];

      inFlightRef.current[noteId] = true;
      setSaving(true);
      try {
        if (!online) {
          await queuePendingUpdate(noteId, patch);
          setNotes((prev) => prev?.map((n) => (n._id === noteId ? { ...n, ...patch } : n)) ?? null);
          const merged = notesRef.current?.find((n) => n._id === noteId);
          if (merged) await cacheNote({ ...merged, ...patch });
          void syncFlush();
          return;
        }
        const { note } = await api.notes.update(noteId, patch);
        knownVersion.current[noteId] = note.updatedAt;
        await cacheNote(note);
        setNotes((prev) => prev?.map((n) => (n._id === noteId ? note : n)) ?? null);
      } catch {
        // Network hiccup mid-save — fall back to the offline queue so the edit isn't lost.
        await queuePendingUpdate(noteId, patch);
        void syncFlush();
      } finally {
        inFlightRef.current[noteId] = false;
        setSaving(false);
        if (rerunRef.current[noteId]) {
          rerunRef.current[noteId] = false;
          void flushPersist(noteId);
        }
      }
    },
    [online, syncFlush]
  );

  // Merges into whatever's already pending for this note rather than
  // replacing it, and debounces per note — editing the title then the
  // content (or switching notes) within the debounce window no longer
  // silently drops one of the changes.
  const persist = useCallback(
    (noteId: string, patch: { title?: string; content?: string; fontFamily?: string }) => {
      pendingPatchRef.current[noteId] = { ...pendingPatchRef.current[noteId], ...patch };
      if (saveTimersRef.current[noteId]) clearTimeout(saveTimersRef.current[noteId]);
      saveTimersRef.current[noteId] = setTimeout(() => void flushPersist(noteId), 600);
    },
    [flushPersist]
  );

  // Don't lose the last debounce window's edits if the user navigates away
  // from Notes entirely while a save is still pending. Reads flushPersist
  // via a ref so this only runs its cleanup on true unmount.
  const flushPersistRef = useRef(flushPersist);
  flushPersistRef.current = flushPersist;

  const flushAllPending = useCallback(() => {
    for (const noteId of Object.keys(pendingPatchRef.current)) {
      void flushPersistRef.current(noteId);
    }
  }, []);

  useEffect(() => {
    return () => flushAllPending();
  }, [flushAllPending]);

  // Extra safety net beyond unmount: a backgrounded tab (switching apps on
  // mobile, minimizing) still has time to finish an async save, so flush
  // there proactively. An actual close/refresh doesn't reliably give async
  // work time to finish at all, so that path instead warns before it
  // happens via the native "leave site?" prompt rather than racing a save
  // against the unload.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushAllPending();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pendingPatchRef.current).length > 0 || Object.values(inFlightRef.current).some(Boolean)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flushAllPending]);

  const saveNow = () => {
    if (selectedId) void flushPersist(selectedId);
  };

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
      void syncFlush();
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
      void syncFlush();
      return;
    }
    if (!online) {
      await queuePendingDelete(noteId);
      void syncFlush();
      return;
    }
    try {
      await api.notes.remove(noteId);
    } catch {
      await queuePendingDelete(noteId);
      void syncFlush();
    }
  };

  const toggleSelectionMode = () => {
    setSelectionMode((v) => !v);
    setCheckedIds(new Set());
  };

  const toggleChecked = (noteId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const bulkDelete = async () => {
    const ids = [...checkedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} note${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;

    setNotes((prev) => prev?.filter((n) => !checkedIds.has(n._id)) ?? null);
    if (selectedId && checkedIds.has(selectedId)) setSelectedId(null);
    setSelectionMode(false);
    setCheckedIds(new Set());
    setBulkBusy(true);
    try {
      await Promise.allSettled(
        ids.map(async (id) => {
          await removeCachedNote(id);
          if (isLocalNoteId(id) || !online) {
            await queuePendingDelete(id);
            return;
          }
          try {
            await api.notes.remove(id);
          } catch {
            await queuePendingDelete(id);
          }
        })
      );
      void syncFlush();
      toast(`Deleted ${ids.length} note${ids.length === 1 ? "" : "s"}`, "success");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkSetPublic = async (enabled: boolean) => {
    const ids = [...checkedIds].filter((id) => !isLocalNoteId(id));
    if (ids.length === 0) {
      toast("Nothing selected can be shared yet — sync first", "info");
      return;
    }
    setSelectionMode(false);
    setCheckedIds(new Set());
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => api.notes.share(id, enabled)));
      const updated = results
        .map((r) => (r.status === "fulfilled" ? r.value.note : null))
        .filter((n): n is Note => !!n);
      if (updated.length) {
        await cacheNotes(updated);
        setNotes((prev) => prev?.map((n) => updated.find((u) => u._id === n._id) ?? n) ?? null);
      }
      const failed = results.length - updated.length;
      if (failed > 0) toast(`${failed} note${failed === 1 ? "" : "s"} couldn't be updated`, "error");
      else toast(enabled ? "Public links turned on" : "Public links turned off", "success");
    } finally {
      setBulkBusy(false);
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
          <div className="flex gap-1.5">
            {filteredNotes.length > 0 && (
              <Button size="sm" variant="ghost" onClick={toggleSelectionMode} className="gap-1.5">
                {selectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
                {selectionMode ? "Cancel" : "Select"}
              </Button>
            )}
            <Button size="sm" onClick={createNote} disabled={!defaultRoom} className="gap-1.5">
              <Plus className="h-4 w-4" />
              New
            </Button>
          </div>
        </div>

        {selectionMode ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <span className="text-xs font-medium text-text-secondary">{checkedIds.size} selected</span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={checkedIds.size === 0 || bulkBusy}
                onClick={() => bulkSetPublic(true)}
                className="gap-1"
                title="Make public"
              >
                <Globe className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={checkedIds.size === 0 || bulkBusy}
                onClick={() => bulkDelete()}
                className="gap-1 text-danger hover:bg-danger/10"
                title="Delete selected"
              >
                <Trash className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          (!online || pendingCount > 0) && (
            <div className="flex items-center gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              {!online ? <WifiSlash className="h-3.5 w-3.5" /> : <CloudArrowUp className="h-3.5 w-3.5" />}
              {!online
                ? "Offline — changes are saved on this device and will sync automatically."
                : `Syncing ${pendingCount} change${pendingCount === 1 ? "" : "s"}…`}
            </div>
          )
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
                onClick={() => (selectionMode ? toggleChecked(note._id) : setSelectedId(note._id))}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  selectedId === note._id && !selectionMode ? "bg-brand-soft" : "hover:bg-surface-hover"
                }`}
              >
                {selectionMode &&
                  (checkedIds.has(note._id) ? (
                    <CheckSquare className="h-4 w-4 shrink-0 text-brand" />
                  ) : (
                    <Square className="h-4 w-4 shrink-0 text-text-secondary" />
                  ))}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 truncate font-medium text-text-primary">
                    {note.title || "Untitled note"}
                    {isLocalNoteId(note._id) && (
                      <span className="shrink-0 text-text-secondary" title="Not yet synced">
                        <CloudArrowUp className="h-3 w-3" />
                      </span>
                    )}
                    {note.visibility === "room" && <Badge tone="brand">Shared</Badge>}
                    {note.publicShare?.enabled && (
                      <span className="shrink-0 text-text-secondary" title="Public link on">
                        <Globe className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-text-secondary">
                    {markdownToPlainText(note.content).slice(0, 60) || "No content"}
                  </span>
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
              <span className="shrink-0 text-xs text-text-secondary">
                {saving ? "Saving…" : selectedId && pendingPatchRef.current[selectedId] ? "Unsaved changes" : "Saved"}
              </span>
              <button
                onClick={saveNow}
                disabled={saving || !selectedId || !pendingPatchRef.current[selectedId]}
                aria-label="Save now"
                title="Save now"
                className="shrink-0 rounded-md p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40"
              >
                <FloppyDisk className="h-4 w-4" />
              </button>

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
