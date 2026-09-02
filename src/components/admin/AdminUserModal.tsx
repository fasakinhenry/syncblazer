import { useEffect, useState } from "react";
import { EnvelopeSimple, SignOut, Trash } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { Badge } from "@/components/ui/Badge.tsx";
import { Spinner } from "@/components/ui/Spinner.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { api, ApiClientError } from "@/lib/api.ts";
import { formatRelativeTime } from "@/lib/format.ts";
import type { AdminUserDetail } from "@/lib/types.ts";

interface AdminUserModalProps {
  userId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

const PROVIDER_LABEL: Record<string, string> = { password: "Email", google: "Google", guest: "Guest" };

export function AdminUserModal({ userId, onClose, onChanged }: AdminUserModalProps) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emailMode, setEmailMode] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (!userId) {
      setDetail(null);
      setEmailMode(false);
      return;
    }
    api.admin.getUser(userId).then((d) => {
      setDetail(d);
      setName(d.user.name);
      setEmail(d.user.email ?? "");
    });
  }, [userId]);

  if (!userId) return null;

  const saveEdits = async () => {
    setSaving(true);
    try {
      const { user } = await api.admin.updateUser(userId, {
        name: name.trim() || undefined,
        email: email.trim() || undefined,
      });
      setDetail((prev) => (prev ? { ...prev, user } : prev));
      onChanged();
      toast("User updated", "success");
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't update this user", "error");
    } finally {
      setSaving(false);
    }
  };

  const resetSessions = async () => {
    setBusy(true);
    try {
      await api.admin.resetUserSessions(userId);
      toast("Signed out everywhere — takes effect within 15 minutes", "success");
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't reset this account", "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async () => {
    if (!window.confirm(`Permanently delete ${detail?.user.name}'s account and all their data? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api.admin.deleteUser(userId);
      toast("Account deleted", "success");
      onChanged();
      onClose();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't delete this account", "error");
      setBusy(false);
    }
  };

  const sendEmail = async () => {
    if (!emailSubject.trim() || !emailMessage.trim()) return;
    setSendingEmail(true);
    try {
      await api.admin.emailUser(userId, { subject: emailSubject.trim(), message: emailMessage.trim() });
      toast("Email sent", "success");
      setEmailMode(false);
      setEmailSubject("");
      setEmailMessage("");
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Couldn't send that email", "error");
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="User details">
      {!detail ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{PROVIDER_LABEL[detail.user.authProvider]}</Badge>
            <span className="text-xs text-text-secondary">Joined {formatRelativeTime(detail.user.createdAt)}</span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            {(
              [
                ["Notes", detail.counts.notes],
                ["Rooms", detail.counts.rooms],
                ["Devices", detail.counts.devices],
                ["Transfers", detail.counts.transfers],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border p-2">
                <div className="text-lg font-semibold text-text-primary">{value}</div>
                <div className="text-[11px] text-text-secondary">{label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-text-secondary">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <label className="mt-1 text-xs font-medium text-text-secondary">Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            <Button
              size="sm"
              variant="secondary"
              onClick={saveEdits}
              loading={saving}
              disabled={!name.trim()}
              className="mt-1 self-start"
            >
              Save changes
            </Button>
          </div>

          {emailMode ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <Input placeholder="Subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} maxLength={200} />
              <textarea
                placeholder="Message"
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-lg border border-border bg-surface p-2.5 text-sm text-text-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEmailMode(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={sendEmail}
                  loading={sendingEmail}
                  disabled={!emailSubject.trim() || !emailMessage.trim() || !detail.user.email}
                >
                  Send
                </Button>
              </div>
              {!detail.user.email && <p className="text-xs text-danger">This account has no email address.</p>}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button size="sm" variant="secondary" onClick={() => setEmailMode(true)} className="gap-1.5">
                <EnvelopeSimple className="h-3.5 w-3.5" />
                Email
              </Button>
              <Button size="sm" variant="secondary" onClick={resetSessions} loading={busy} className="gap-1.5">
                <SignOut className="h-3.5 w-3.5" />
                Sign out everywhere
              </Button>
              <Button size="sm" variant="destructive" onClick={deleteUser} loading={busy} className="ml-auto gap-1.5">
                <Trash className="h-3.5 w-3.5" />
                Delete account
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
