import { useEffect, useState } from "react";
import { EnvelopeSimple, Globe, Lock, SignOut, Trash, WifiHigh, CloudArrowUp } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { Badge } from "@/components/ui/Badge.tsx";
import { Spinner } from "@/components/ui/Spinner.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { api, ApiClientError } from "@/lib/api.ts";
import { formatBytes, formatRelativeTime } from "@/lib/format.ts";
import { DEVICE_TYPE_ICON } from "@/components/devices/deviceIcons.tsx";
import { STATUS_LABEL, STATUS_TONE } from "@/components/transfers/statusMeta.ts";
import type { AdminUserDetail } from "@/lib/types.ts";

function transferDeviceName(d: AdminUserDetail["recentTransfers"][number]["senderDeviceId"]): string {
  if (!d) return "Deleted device";
  return typeof d === "string" ? "Device" : d.name;
}

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
    <Modal open onClose={onClose} title="User details" size="lg">
      {!detail ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{PROVIDER_LABEL[detail.user.authProvider]}</Badge>
            <span className="text-xs text-text-secondary">Joined {formatRelativeTime(detail.user.createdAt)}</span>
            <span className="text-xs text-text-secondary">
              · Last active {detail.user.lastLoginAt ? formatRelativeTime(detail.user.lastLoginAt) : "never (pre-dates tracking)"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
            {(
              [
                ["Notes", detail.counts.notes],
                ["Public", detail.counts.publicNotes],
                ["Rooms", detail.counts.rooms],
                ["Devices", detail.counts.devices],
                ["Transfers", detail.counts.transfers],
                ["Sent", formatBytes(detail.counts.completedBytes)],
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

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold text-text-secondary">Devices ({detail.devices.length})</h3>
              {detail.devices.length === 0 ? (
                <p className="text-xs text-text-secondary">None yet.</p>
              ) : (
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {detail.devices.map((d) => {
                    const Icon = DEVICE_TYPE_ICON[d.type];
                    return (
                      <div key={d._id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                        <span className="flex-1 truncate text-text-primary">{d.name}</span>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.status === "online" ? "bg-success" : "bg-text-secondary/40"}`} />
                        <span className="shrink-0 text-text-secondary">{formatRelativeTime(d.lastSeenAt)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold text-text-secondary">Rooms ({detail.rooms.length})</h3>
              {detail.rooms.length === 0 ? (
                <p className="text-xs text-text-secondary">None yet.</p>
              ) : (
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {detail.rooms.map((r) => (
                    <div key={r._id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
                      <span className="flex-1 truncate text-text-primary">{r.name}</span>
                      {r.isDefault && <Badge tone="brand">Default</Badge>}
                      <span className="shrink-0 text-text-secondary">{formatRelativeTime(r.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold text-text-secondary">Recent notes ({detail.recentNotes.length})</h3>
              {detail.recentNotes.length === 0 ? (
                <p className="text-xs text-text-secondary">None yet.</p>
              ) : (
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {detail.recentNotes.map((n) => (
                    <div key={n._id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
                      {n.publicShare?.enabled ? (
                        <Globe className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                      ) : (
                        <Lock className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                      )}
                      <span className="flex-1 truncate text-text-primary">{n.title || "Untitled note"}</span>
                      <span className="shrink-0 text-text-secondary">{formatRelativeTime(n.updatedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold text-text-secondary">Recent transfers ({detail.recentTransfers.length})</h3>
              {detail.recentTransfers.length === 0 ? (
                <p className="text-xs text-text-secondary">None yet.</p>
              ) : (
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {detail.recentTransfers.map((t) => (
                    <div key={t._id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
                      {t.transferMethod === "local" ? (
                        <WifiHigh className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                      ) : (
                        <CloudArrowUp className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                      )}
                      <span className="flex-1 truncate text-text-primary" title={`${transferDeviceName(t.senderDeviceId)} → ${transferDeviceName(t.receiverDeviceId)}`}>
                        {t.name}
                      </span>
                      <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {detail.recentActivity.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold text-text-secondary">Recent activity</h3>
              <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
                {detail.recentActivity.map((a) => (
                  <div key={a._id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
                    <span className="flex-1 truncate text-text-primary">{a.message}</span>
                    <span className="shrink-0 text-text-secondary">{formatRelativeTime(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

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
