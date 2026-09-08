import { Avatar } from "@/components/Avatar.tsx";
import type { NoteWatcher } from "@/hooks/useNoteCollab.ts";
import type { SelectedCollaborator } from "@/components/notes/UserDetailsModal.tsx";

// However many the server sends (capped to 25 server-side), the UI itself
// only ever shows the first 10 avatars — a "+N" badge covers the rest.
const MAX_SHOWN = 10;

/** Who's currently viewing this note, live — every authenticated watcher,
 * not just the people editing (a read-only room member still shows up
 * here). Only ever populated by an authenticated socket connection, so
 * there's no anonymous-viewer case to handle: presence is inherently
 * identity-based. Clicking an avatar opens UserDetailsModal with that
 * person's name/email. */
export function NoteWatchersRow({
  watchers,
  total,
  onSelect,
}: {
  watchers: NoteWatcher[];
  total: number;
  onSelect: (user: SelectedCollaborator) => void;
}) {
  if (watchers.length === 0) return null;
  const shown = watchers.slice(0, MAX_SHOWN);
  const overflow = Math.max(0, total - shown.length);

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {shown.map((w) => (
          <button
            key={w.userId}
            type="button"
            title={`${w.name}${w.canEdit ? "" : " (viewing)"}`}
            onClick={() => onSelect({ name: w.name, email: w.email, avatarUrl: w.avatarUrl, canEdit: w.canEdit })}
            className="rounded-full transition-transform hover:z-10 hover:scale-110"
          >
            <Avatar name={w.name} src={w.avatarUrl} className="h-6 w-6 border-2 border-background text-[10px]" />
          </button>
        ))}
        {overflow > 0 && (
          <span
            title={`${overflow} more`}
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-surface-hover text-[10px] font-semibold text-text-secondary"
          >
            +{overflow}
          </span>
        )}
      </div>
      <span className="text-xs text-text-secondary">{total === 1 ? "1 person viewing" : `${total} people viewing`}</span>
    </div>
  );
}
