import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Fire } from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api.ts";
import type { PublicNote } from "@/lib/types.ts";
import { Avatar } from "@/components/Avatar.tsx";
import { NoteEditor } from "@/components/notes/NoteEditor.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { formatRelativeTime } from "@/lib/format.ts";

export function PublicNotePage() {
  const { token } = useParams<{ token: string }>();
  const [note, setNote] = useState<PublicNote | null>(null);
  const [owner, setOwner] = useState<{ name: string; avatarUrl?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
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
              noteId={token ?? "shared"}
              initialContent={note.content}
              fontFamily={note.fontFamily}
              editable={false}
              onUpdateMarkdown={() => {}}
              onFontChange={() => {}}
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
