import { useState } from "react";
import { Check, Copy, Globe, Lock, PencilSimple, UsersThree, Warning } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Toggle } from "@/components/ui/Toggle.tsx";
import { ShareTargets } from "@/components/ShareTargets.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { api, ApiClientError } from "@/lib/api.ts";
import { formatRelativeTime } from "@/lib/format.ts";
import type { Note, NoteAccessLevel, NoteVisibility, Room } from "@/lib/types.ts";

interface ShareNoteModalProps {
  open: boolean;
  onClose: () => void;
  note: Note;
  rooms: Room[];
  onUpdated: (note: Note) => void;
}

/** Small segmented view/edit control reused for both the room and the
 * public-link access levels — the two axes the user asked to control. */
function AccessLevelPicker({
  value,
  onChange,
  disabled,
}: {
  value: NoteAccessLevel;
  onChange: (level: NoteAccessLevel) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("view")}
        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
          value === "view" ? "bg-brand text-white" : "text-text-secondary hover:bg-surface-hover"
        }`}
      >
        Can view
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("edit")}
        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
          value === "edit" ? "bg-brand text-white" : "text-text-secondary hover:bg-surface-hover"
        }`}
      >
        Can edit
      </button>
    </div>
  );
}

export function ShareNoteModal({ open, onClose, note, rooms, onUpdated }: ShareNoteModalProps) {
  const { toast } = useToast();
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [savingRoom, setSavingRoom] = useState(false);
  const [savingRoomAccess, setSavingRoomAccess] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [savingLinkAccess, setSavingLinkAccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentRoom = rooms.find((r) => r._id === note.roomId);

  const patchNote = async (
    patch: { visibility?: NoteVisibility; roomAccess?: NoteAccessLevel; roomId?: string },
    setSaving: (v: boolean) => void,
    errorMessage: string
  ) => {
    setSaving(true);
    try {
      const { note: updated } = await api.notes.update(note._id, patch);
      onUpdated(updated);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : errorMessage, "error");
    } finally {
      setSaving(false);
    }
  };

  const setVisibility = (visibility: NoteVisibility) => {
    if (visibility === note.visibility) return;
    void patchNote({ visibility }, setSavingVisibility, "Couldn't update sharing. Try again.");
  };

  const setRoomAccess = (roomAccess: NoteAccessLevel) => {
    if (roomAccess === note.roomAccess) return;
    void patchNote({ roomAccess }, setSavingRoomAccess, "Couldn't update room access. Try again.");
  };

  const moveToRoom = (roomId: string) => {
    if (roomId === note.roomId) return;
    void patchNote({ roomId }, setSavingRoom, "Couldn't move the note to that room. Try again.");
  };

  const toggleLinkShare = async (enabled: boolean) => {
    setSavingLink(true);
    try {
      const { note: updated } = await api.notes.share(note._id, enabled, note.publicShare?.access ?? "view");
      onUpdated(updated);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't update the public link. Try again.", "error");
    } finally {
      setSavingLink(false);
    }
  };

  const setLinkAccess = async (access: NoteAccessLevel) => {
    if (access === note.publicShare?.access) return;
    setSavingLinkAccess(true);
    try {
      const { note: updated } = await api.notes.share(note._id, true, access);
      onUpdated(updated);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't update link access. Try again.", "error");
    } finally {
      setSavingLinkAccess(false);
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
                <span className="block text-sm font-medium text-text-primary">Everyone in “{currentRoom?.name ?? "this room"}”</span>
                <span className="block text-xs text-text-secondary">Choose the room and what members can do below.</span>
              </span>
              {note.visibility === "room" && <Check className="h-4 w-4 text-brand" />}
            </button>
          </div>

          {note.visibility === "room" && (
            <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-surface-hover p-3">
              {rooms.length > 1 && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-text-secondary">Room</span>
                  <select
                    value={note.roomId}
                    disabled={savingRoom}
                    onChange={(e) => moveToRoom(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm text-text-primary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    {rooms.map((room) => (
                      <option key={room._id} value={room._id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-secondary">Room members can</span>
                <AccessLevelPicker value={note.roomAccess} onChange={setRoomAccess} disabled={savingRoomAccess} />
              </div>
            </div>
          )}
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
          <p className="text-xs text-text-secondary">Anyone with the link can open it — no account needed.</p>

          {note.publicShare?.enabled && (
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-secondary">Anyone with the link can</span>
                <AccessLevelPicker value={note.publicShare.access} onChange={setLinkAccess} disabled={savingLinkAccess} />
              </div>

              {note.publicShare.access === "edit" && (
                <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                  <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Anyone who opens this link can edit it directly — changes save automatically, no sign-in required.
                  Only share it with people you trust.
                </div>
              )}

              {shareUrl && (
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-1.5 truncate rounded-lg border border-border bg-surface-hover px-3 py-2 text-xs text-text-secondary">
                    {note.publicShare.access === "edit" ? (
                      <PencilSimple className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Globe className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{shareUrl}</span>
                  </div>
                  <Button variant="secondary" size="sm" onClick={copyLink} className="shrink-0 gap-1.5">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              )}

              {shareUrl && <ShareTargets url={shareUrl} title={`${note.title || "A note"} — SyncBlaze`} />}

              <p className="text-xs text-text-secondary">
                {note.publicShare.viewCount ?? 0} view{note.publicShare.viewCount === 1 ? "" : "s"}
                {note.publicShare.lastViewedAt ? ` · last viewed ${formatRelativeTime(note.publicShare.lastViewedAt)}` : ""}
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
