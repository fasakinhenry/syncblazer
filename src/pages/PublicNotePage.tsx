import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { SignIn } from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api.ts";
import type { PublicNote } from "@/lib/types.ts";
import { useAuth } from "@/context/AuthContext.tsx";
import { Avatar } from "@/components/Avatar.tsx";
import { NoteEditor } from "@/components/notes/NoteEditor.tsx";
import { PublicNoteHeader } from "@/components/notes/PublicNoteHeader.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { formatRelativeTime } from "@/lib/format.ts";
import { SharedNoteWorkspace } from "@/pages/SharedNoteWorkspace.tsx";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.ts";

/** The anonymous, read-only view of a publicly shared note. Editing a
 * shared note always requires being signed in — see SharedNoteWorkspace,
 * which this delegates to once someone's authenticated — so this page
 * never renders an editable field, even when the owner turned on edit
 * access; it just prompts an unauthenticated visitor to sign in instead.
 * PublicNoteHeader already carries a general "Log in" CTA for any visitor;
 * the banner below is specifically for the case where signing in would
 * additionally unlock editing this particular note. */
function AnonymousPublicNote({ token }: { token: string }) {
  const [note, setNote] = useState<PublicNote | null>(null);
  const [owner, setOwner] = useState<{ name: string; avatarUrl?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.notes
      .getShared(token)
      .then(({ note, owner }) => {
        setNote(note);
        setOwner(owner);
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : "This note isn't available.");
      });
  }, [token]);

  useDocumentTitle(
    note ? `${note.title || "Untitled note"}: Shared on SyncBlaze` : "Shared Note: SyncBlaze",
    owner ? `A note shared by ${owner.name} on SyncBlaze.` : undefined
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      {error ? (
        <EmptyState title="Note unavailable" description={error} />
      ) : !note ? (
        <PageSpinner />
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="font-display text-2xl font-semibold text-text-primary">{note.title || "Untitled note"}</h1>
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
              <span>Read-only</span>
            </div>
          </div>

          <NoteEditor
            noteId={token}
            initialContent={note.content}
            fontFamily={note.fontFamily}
            editable={false}
            onUpdateMarkdown={() => {}}
            onFontChange={() => {}}
          />

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-hover p-3">
            <p className="text-xs text-text-secondary">
              {note.access === "edit" ? "This note can be edited — sign in to make changes." : "Sign in to SyncBlaze to make your own notes."}
            </p>
            <Link to="/login">
              <Button size="sm" variant="secondary" className="gap-1.5">
                <SignIn className="h-3.5 w-3.5" />
                Sign in
              </Button>
            </Link>
          </div>

          <p className="text-center text-xs text-text-secondary">
            Made with{" "}
            <Link to="/" className="font-medium text-brand hover:underline">
              SyncBlaze
            </Link>
          </p>
        </div>
      )}
    </main>
  );
}

export function PublicNotePage() {
  const { token } = useParams<{ token: string }>();
  const { status } = useAuth();

  if (!token) return null;
  // Avoid flashing the anonymous read-only view for someone who's actually
  // signed in — wait for the auth check before deciding which to render.
  if (status === "loading") return <PageSpinner />;
  if (status === "authenticated") return <SharedNoteWorkspace token={token} />;

  return (
    <div className="min-h-dvh bg-background">
      <PublicNoteHeader />
      <AnonymousPublicNote token={token} />
    </div>
  );
}
