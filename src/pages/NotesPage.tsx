import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, MagnifyingGlass, Note as NoteIcon, Trash } from "@phosphor-icons/react";
import { api } from "@/lib/api.ts";
import type { Note } from "@/lib/types.ts";
import { useRooms } from "@/context/RoomContext.tsx";
import { useSocket } from "@/context/SocketContext.tsx";
import { formatRelativeTime } from "@/lib/format.ts";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback.ts";
import { Button } from "@/components/ui/Button.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";

export function NotesPage() {
  const { defaultRoom } = useRooms();
  const { socket } = useSocket();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (searchTerm?: string) => {
    const { notes } = await api.notes.list(searchTerm ? { search: searchTerm } : undefined);
    setNotes(notes);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    const onCreated = ({ note }: { note: Note }) => setNotes((prev) => (prev ? [note, ...prev] : prev));
    const onUpdated = ({ note }: { note: Note }) =>
      setNotes((prev) => prev?.map((n) => (n._id === note._id ? note : n)) ?? null);
    const onDeleted = ({ noteId }: { noteId: string }) => setNotes((prev) => prev?.filter((n) => n._id !== noteId) ?? null);
    socket.on("note:created", onCreated);
    socket.on("note:updated", onUpdated);
    socket.on("note:deleted", onDeleted);
    return () => {
      socket.off("note:created", onCreated);
      socket.off("note:updated", onUpdated);
      socket.off("note:deleted", onDeleted);
    };
  }, [socket]);

  const selected = useMemo(() => notes?.find((n) => n._id === selectedId) ?? null, [notes, selectedId]);

  useEffect(() => {
    setDraftTitle(selected?.title ?? "");
    setDraftContent(selected?.content ?? "");
  }, [selected]);

  const persist = useDebouncedCallback(async (noteId: string, title: string, content: string) => {
    setSaving(true);
    try {
      const { note } = await api.notes.update(noteId, { title: title || "Untitled note", content });
      setNotes((prev) => prev?.map((n) => (n._id === noteId ? note : n)) ?? null);
    } finally {
      setSaving(false);
    }
  }, 600);

  const onChangeTitle = (value: string) => {
    setDraftTitle(value);
    if (selectedId) persist(selectedId, value, draftContent);
  };
  const onChangeContent = (value: string) => {
    setDraftContent(value);
    if (selectedId) persist(selectedId, draftTitle, value);
  };

  const createNote = async () => {
    if (!defaultRoom) return;
    const { note } = await api.notes.create({ roomId: defaultRoom._id, title: "Untitled note" });
    setNotes((prev) => (prev ? [note, ...prev] : [note]));
    setSelectedId(note._id);
  };

  const deleteNote = async (noteId: string) => {
    if (!window.confirm("Delete this note?")) return;
    await api.notes.remove(noteId);
    setNotes((prev) => prev?.filter((n) => n._id !== noteId) ?? null);
    if (selectedId === noteId) setSelectedId(null);
  };

  const onSearch = (value: string) => {
    setSearch(value);
    void load(value || undefined);
  };

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

        <div className="relative">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <Input placeholder="Search notes" value={search} onChange={(e) => onSearch(e.target.value)} className="pl-9" />
        </div>

        {notes.length === 0 ? (
          <EmptyState
            icon={<NoteIcon className="h-8 w-8" />}
            title="No notes yet"
            description="Capture something you'll want everywhere."
            action={
              <Button onClick={createNote} disabled={!defaultRoom}>
                New note
              </Button>
            }
          />
        ) : (
          <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {notes.map((note) => (
              <button
                key={note._id}
                onClick={() => setSelectedId(note._id)}
                className={`flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  selectedId === note._id ? "bg-brand-soft" : "hover:bg-surface-hover"
                }`}
              >
                <span className="truncate font-medium text-text-primary">{note.title || "Untitled note"}</span>
                <span className="truncate text-xs text-text-secondary">
                  {note.content ? note.content.slice(0, 60) : "No content"} · {formatRelativeTime(note.updatedAt)}
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
                className="flex-1 bg-transparent text-lg font-semibold text-text-primary outline-none"
              />
              <span className="shrink-0 text-xs text-text-secondary">{saving ? "Saving…" : "Saved"}</span>
              <button
                onClick={() => deleteNote(selected._id)}
                aria-label="Delete note"
                className="rounded-md p-2 text-text-secondary hover:bg-danger/10 hover:text-danger"
              >
                <Trash className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={draftContent}
              onChange={(e) => onChangeContent(e.target.value)}
              placeholder="Start typing…"
              className="min-h-[50vh] flex-1 resize-none rounded-xl border border-border bg-surface p-4 text-sm text-text-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
        ) : (
          <EmptyState title="Select a note" description="Choose a note from the list, or create a new one." />
        )}
      </div>
    </div>
  );
}
