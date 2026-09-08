import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Fire, PencilSimple } from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api.ts";
import type { PublicNote } from "@/lib/types.ts";
import { Avatar } from "@/components/Avatar.tsx";
import { NoteEditor } from "@/components/notes/NoteEditor.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { formatRelativeTime } from "@/lib/format.ts";
import { DEFAULT_NOTE_FONT } from "@/lib/noteFonts.ts";

export function PublicNotePage() {
  const { token } = useParams<{ token: string }>();
  const [note, setNote] = useState<PublicNote | null>(null);
  const [owner, setOwner] = useState<{ name: string; avatarUrl?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftFont, setDraftFont] = useState(DEFAULT_NOTE_FONT);
  const [saving, setSaving] = useState(false);

  // Anonymous editing (see notes/ShareNoteModal.tsx) is intentionally
  // simpler than the authenticated notes editor — no offline queue, no
  // live Yjs collaboration (that needs an authenticated socket connection,
  // which an anonymous visitor never has). Just a debounced autosave
  // straight to the public edit endpoint.
  const pendingPatchRef = useRef<{ title?: string; content?: string; fontFamily?: string }>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const rerunRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    api.notes
      .getShared(token)
      .then(({ note, owner }) => {
        setNote(note);
        setOwner(owner);
        setDraftTitle(note.title);
        setDraftContent(note.content);
        setDraftFont(note.fontFamily);
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : "This note isn't available.");
      });
  }, [token]);

  const flushPersist = useCallback(async () => {
    if (!token) return;
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
      const { note: updated } = await api.notes.updateShared(token, patch);
      setNote(updated);
    } catch {
      // Leave it — the next edit re-queues a patch, and the periodic retry
      // below (via the debounce restarting on the next keystroke) covers it.
    } finally {
      inFlightRef.current = false;
      setSaving(false);
      if (rerunRef.current) {
        rerunRef.current = false;
        void flushPersist();
      }
    }
  }, [token]);

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

  const editable = note?.access === "edit";

  const onChangeTitle = (value: string) => {
    setDraftTitle(value);
    persist({ title: value });
  };
  const onChangeContent = (markdown: string) => {
    setDraftContent(markdown);
    persist({ content: markdown });
  };
  const onChangeFont = (fontFamily: string) => {
    setDraftFont(fontFamily);
    persist({ fontFamily });
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
          <div className="flex flex-col gap-6">
            <div>
              {editable ? (
                <input
                  value={draftTitle}
                  onChange={(e) => onChangeTitle(e.target.value)}
                  placeholder="Untitled note"
                  className="w-full bg-transparent font-display text-2xl font-semibold text-text-primary outline-none"
                />
              ) : (
                <h1 className="font-display text-2xl font-semibold text-text-primary">{draftTitle || "Untitled note"}</h1>
              )}
              <div className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
                {owner && (
                  <>
                    <Avatar name={owner.name} src={owner.avatarUrl} className="h-5 w-5 text-[10px]" />
                    <span>{owner.name}</span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>Updated {formatRelativeTime(note.updatedAt)}</span>
                <span aria-hidden="true">·</span>
                {editable ? (
                  <span className="flex items-center gap-1 text-brand">
                    <PencilSimple className="h-3.5 w-3.5" />
                    {saving ? "Saving…" : "Editable — anyone with this link can edit"}
                  </span>
                ) : (
                  <span>Read-only</span>
                )}
              </div>
            </div>

            <NoteEditor
              noteId={token ?? "shared"}
              initialContent={draftContent}
              fontFamily={draftFont}
              editable={editable}
              onUpdateMarkdown={onChangeContent}
              onFontChange={onChangeFont}
            />

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
