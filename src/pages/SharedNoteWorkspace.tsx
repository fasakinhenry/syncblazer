import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Fire, PencilSimple } from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api.ts";
import type { Note } from "@/lib/types.ts";
import { DEFAULT_NOTE_FONT } from "@/lib/noteFonts.ts";
import { useNoteCollab } from "@/hooks/useNoteCollab.ts";
import { NoteEditor } from "@/components/notes/NoteEditor.tsx";
import { NoteWatchersRow } from "@/components/notes/NoteWatchersRow.tsx";
import { GuestEditBlockedBanner } from "@/components/notes/GuestEditBlockedBanner.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";

/** What a signed-in visitor gets from a public share link — resolved to
 * the real note (see api.notes.openShared), so unlike the anonymous
 * /n/:token page this can be a genuine editor: real autosave through the
 * normal PATCH /notes/:noteId (which already grants write access for an
 * edit-level public share to any authenticated user), plus live Yjs
 * collaboration and the same watcher-presence row the authenticated notes
 * page shows. Editing a shared note always requires being signed in —
 * there is no anonymous write path. */
export function SharedNoteWorkspace({ token }: { token: string }) {
  const [note, setNote] = useState<Note | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [blockedByGuest, setBlockedByGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftFont, setDraftFont] = useState(DEFAULT_NOTE_FONT);
  const [saving, setSaving] = useState(false);

  const pendingPatchRef = useRef<{ title?: string; content?: string; fontFamily?: string }>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const rerunRef = useRef(false);

  useEffect(() => {
    api.notes
      .openShared(token)
      .then(({ note, canEdit, blockedByGuest }) => {
        setNote(note);
        setCanEdit(canEdit);
        setBlockedByGuest(blockedByGuest);
        setDraftTitle(note.title);
        setDraftContent(note.content);
        setDraftFont(note.fontFamily);
      })
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "This note isn't available."));
  }, [token]);

  const collab = useNoteCollab(canEdit ? (note?._id ?? null) : null, draftContent);

  const flushPersist = useCallback(async () => {
    if (!note) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (inFlightRef.current) {
      rerunRef.current = true;
      return;
    }
    const patch = pendingPatchRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingPatchRef.current = {};

    inFlightRef.current = true;
    setSaving(true);
    try {
      const { note: updated } = await api.notes.update(note._id, patch);
      setNote(updated);
    } catch {
      // Leave it queued — the next edit (or a manual retry via more typing)
      // re-triggers the debounce.
    } finally {
      inFlightRef.current = false;
      setSaving(false);
      if (rerunRef.current) {
        rerunRef.current = false;
        void flushPersist();
      }
    }
  }, [note]);

  const persist = useCallback(
    (patch: { title?: string; content?: string; fontFamily?: string }) => {
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => void flushPersist(), 600);
    },
    [flushPersist]
  );

  useEffect(() => {
    return () => void flushPersist();
  }, [flushPersist]);

  const onChangeTitle = (value: string) => {
    setDraftTitle(value);
    if (canEdit) persist({ title: value });
  };
  const onChangeContent = (markdown: string) => {
    setDraftContent(markdown);
    if (canEdit) persist({ content: markdown });
  };
  const onChangeFont = (fontFamily: string) => {
    setDraftFont(fontFamily);
    if (canEdit) persist({ fontFamily });
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border px-4 py-4 md:px-8">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand">
            <Fire weight="fill" className="h-4 w-4 text-white" />
          </span>
          <span className="font-display text-base font-semibold text-text-primary">SyncBlaze</span>
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10">
        {error ? (
          <EmptyState title="Note unavailable" description={error} />
        ) : !note ? (
          <PageSpinner />
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              {canEdit ? (
                <input
                  value={draftTitle}
                  onChange={(e) => onChangeTitle(e.target.value)}
                  placeholder="Untitled note"
                  className="w-full bg-transparent font-display text-2xl font-semibold text-text-primary outline-none"
                />
              ) : (
                <h1 className="font-display text-2xl font-semibold text-text-primary">{draftTitle || "Untitled note"}</h1>
              )}
              {canEdit && (
                <p className="mt-1 flex items-center gap-1 text-xs text-brand">
                  <PencilSimple className="h-3.5 w-3.5" />
                  {saving ? "Saving…" : "Shared with you — edits save automatically"}
                </p>
              )}
            </div>

            {blockedByGuest && <GuestEditBlockedBanner />}

            <NoteEditor
              noteId={note._id}
              initialContent={draftContent}
              fontFamily={draftFont}
              editable={canEdit}
              onUpdateMarkdown={onChangeContent}
              onFontChange={onChangeFont}
              collab={collab}
            />

            {collab && <NoteWatchersRow watchers={collab.watchers} total={collab.totalWatchers} />}

            <p className="text-center text-xs text-text-secondary">
              Made with{" "}
              <Link to="/" className="font-medium text-brand hover:underline">
                SyncBlaze
              </Link>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
