import { useState } from "react";
import { Check, Copy, Envelope } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Avatar } from "@/components/Avatar.tsx";

export interface SelectedCollaborator {
  name: string;
  email?: string;
  avatarUrl?: string;
  canEdit?: boolean;
}

/** Who this person is, opened by clicking either a live cursor's avatar
 * (NoteEditor.tsx) or a watcher's avatar in the "N people viewing" row
 * (NoteWatchersRow.tsx) — same modal either way. */
export function UserDetailsModal({ user, onClose }: { user: SelectedCollaborator | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copyEmail = () => {
    if (!user?.email) return;
    navigator.clipboard.writeText(user.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!user) return null;

  return (
    <Modal open={!!user} onClose={onClose} title="Collaborator">
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <Avatar name={user.name} src={user.avatarUrl} className="h-16 w-16 text-xl" />
        <div>
          <p className="text-lg font-semibold text-text-primary">{user.name}</p>
          {user.canEdit !== undefined && (
            <p className="text-xs text-text-secondary">{user.canEdit ? "Can edit this note" : "Viewing only"}</p>
          )}
        </div>

        {user.email ? (
          <div className="flex w-full items-center gap-2">
            <div className="flex flex-1 items-center gap-1.5 truncate rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-secondary">
              <Envelope className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{user.email}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={copyEmail} className="shrink-0 gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No email on this account</p>
        )}
      </div>
    </Modal>
  );
}
