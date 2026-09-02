import { useState } from "react";
import { Check, Copy, Globe, Lock, UsersThree } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Toggle } from "@/components/ui/Toggle.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { api, ApiClientError } from "@/lib/api.ts";
import type { Note, NoteVisibility } from "@/lib/types.ts";

interface ShareNoteModalProps {
  open: boolean;
  onClose: () => void;
  note: Note;
  roomName: string;
  onUpdated: (note: Note) => void;
}

export function ShareNoteModal({ open, onClose, note, roomName, onUpdated }: ShareNoteModalProps) {
  const { toast } = useToast();
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  const setVisibility = async (visibility: NoteVisibility) => {
    if (visibility === note.visibility) return;
    setSavingVisibility(true);
    try {
      const { note: updated } = await api.notes.update(note._id, { visibility });
      onUpdated(updated);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't update sharing. Try again.", "error");
    } finally {
      setSavingVisibility(false);
    }
  };

  const toggleLinkShare = async (enabled: boolean) => {
    setSavingLink(true);
    try {
      const { note: updated } = await api.notes.share(note._id, enabled);
      onUpdated(updated);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't update the public link. Try again.", "error");
    } finally {
      setSavingLink(false);
    }
  };

  const shareUrl = note.publicShare?.token ? `${window.location.origin}/n/${note.publicShare.token}` : null;

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open={open} onClose={onClose} title="Share note">
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-sm font-medium text-text-primary">Who can see this</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={savingVisibility}
              onClick={() => setVisibility("private")}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                note.visibility === "private" ? "border-brand bg-brand-soft" : "border-border hover:bg-surface-hover"
              }`}
            >
              <Lock className="h-4 w-4 shrink-0 text-text-secondary" />
              <span className="flex-1">
                <span className="block text-sm font-medium text-text-primary">Only me</span>
                <span className="block text-xs text-text-secondary">Private, even if this note lives in a shared room.</span>
              </span>
              {note.visibility === "private" && <Check className="h-4 w-4 text-brand" />}
            </button>
            <button
              type="button"
              disabled={savingVisibility}
              onClick={() => setVisibility("room")}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                note.visibility === "room" ? "border-brand bg-brand-soft" : "border-border hover:bg-surface-hover"
              }`}
            >
              <UsersThree className="h-4 w-4 shrink-0 text-text-secondary" />
              <span className="flex-1">
                <span className="block text-sm font-medium text-text-primary">Everyone in “{roomName}”</span>
                <span className="block text-xs text-text-secondary">Room members can view and edit it too.</span>
              </span>
              {note.visibility === "room" && <Check className="h-4 w-4 text-brand" />}
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-text-primary">Public link</p>
            <Toggle
              checked={!!note.publicShare?.enabled}
              onChange={(enabled) => toggleLinkShare(enabled)}
              disabled={savingLink}
              label="Public link"
            />
          </div>
          <p className="text-xs text-text-secondary">Anyone with the link can view (never edit) — no account needed.</p>
          {note.publicShare?.enabled && shareUrl && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 items-center gap-1.5 truncate rounded-lg border border-border bg-surface-hover px-3 py-2 text-xs text-text-secondary">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{shareUrl}</span>
              </div>
              <Button variant="secondary" size="sm" onClick={copyLink} className="shrink-0 gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
