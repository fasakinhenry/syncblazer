import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Broadcast,
  ChatText,
  PaperPlaneTilt,
  Plus,
  QrCode,
  SignOut,
  UploadSimple,
  UsersThree,
  WifiHigh,
  X,
} from "@phosphor-icons/react";
import { useLocalSession } from "@/context/LocalSessionContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { detectDeviceInfo } from "@/lib/deviceInfo.ts";
import { formatBytes } from "@/lib/format.ts";
import { InviteCodeDisplay } from "@/components/localSession/InviteCodeDisplay.tsx";
import { CodeEntry } from "@/components/localSession/CodeEntry.tsx";
import { LocalIncomingTransfers } from "@/components/localSession/LocalIncomingTransfers.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { Spinner } from "@/components/ui/Spinner.tsx";
import { ConfettiBurst } from "@/components/ConfettiBurst.tsx";

function suggestedName(): string {
  return detectDeviceInfo().name;
}

const URL_PATTERN = /^https?:\/\/\S+$/i;

export function LocalSessionPage() {
  const {
    role,
    peers,
    pendingInviteCode,
    connecting,
    error,
    startHosting,
    createInvite,
    cancelInvite,
    completeInvite,
    joinWithOfferCode,
    sendFile,
    sendText,
    leaveSession,
  } = useLocalSession();
  const { toast } = useToast();

  const [nameInput, setNameInput] = useState(suggestedName());
  const [intent, setIntent] = useState<"none" | "host" | "guest">("none");
  const [answeringInvite, setAnsweringInvite] = useState(false);
  const [guestAnswerCode, setGuestAnswerCode] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<string | "all" | null>(null);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ target: string; sent: number; total: number } | null>(null);
  const [composeTarget, setComposeTarget] = useState<string | "all" | null>(null);
  const [composeText, setComposeText] = useState("");
  const [sendingText, setSendingText] = useState(false);
  const [celebrateConnection, setCelebrateConnection] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const knownConnectedIdsRef = useRef<Set<string>>(new Set());

  // Fire a confetti burst the moment a device we didn't already have a live
  // link to becomes connected — not on every roster update, and not on
  // devices we only know about indirectly through the host.
  useEffect(() => {
    const nowConnected = peers.filter((p) => p.status === "connected").map((p) => p.id);
    const isNew = nowConnected.some((id) => !knownConnectedIdsRef.current.has(id));
    if (isNew) setCelebrateConnection(true);
    knownConnectedIdsRef.current = new Set(nowConnected);
  }, [peers]);

  const triggerSend = (target: string | "all") => {
    setSendTarget(target);
    fileInputRef.current?.click();
  };

  const onFileChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = sendTarget;
    e.target.value = "";
    if (!file || !target) return;
    const kind = file.type.startsWith("image/") ? "image" : "file";
    setSending(true);
    setSendProgress({ target, sent: 0, total: file.size });
    try {
      await sendFile(target, file, kind, (sentBytes, totalBytes) => {
        setSendProgress({ target, sent: sentBytes, total: totalBytes });
      });
      toast(target === "all" ? `Sent "${file.name}" to everyone` : `Sent "${file.name}"`, "success");
    } catch {
      toast("Couldn't send that file", "error");
    } finally {
      setSending(false);
      setSendProgress(null);
    }
  };

  const submitText = async () => {
    const content = composeText.trim();
    const target = composeTarget;
    if (!content || !target) return;
    const kind = URL_PATTERN.test(content) ? "link" : "text";
    setSendingText(true);
    try {
      await sendText(target, content, kind, kind === "link" ? content : `${content.slice(0, 40)}${content.length > 40 ? "…" : ""}`);
      toast(target === "all" ? "Sent to everyone" : "Sent", "success");
      setComposeText("");
      setComposeTarget(null);
    } catch {
      toast("Couldn't send that", "error");
    } finally {
      setSendingText(false);
    }
  };

  // --- Not in a session yet ---
  if (role === "none") {
    if (intent === "none") {
      return (
        <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <WifiHigh className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Local session</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Connect devices directly over Wi-Fi or a phone hotspot, no internet required. One device starts a
              session and shows a QR code; everyone else scans it to join. Files move device to device, never
              through the cloud.
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={() => setIntent("host")}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-6 hover:border-brand hover:bg-brand-soft"
            >
              <QrCode className="h-6 w-6 text-brand" />
              <span className="font-medium text-text-primary">Start a session</span>
              <span className="text-xs text-text-secondary">Show a code for others to scan</span>
            </button>
            <button
              onClick={() => setIntent("guest")}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-6 hover:border-brand hover:bg-brand-soft"
            >
              <UsersThree className="h-6 w-6 text-brand" />
              <span className="font-medium text-text-primary">Join a session</span>
              <span className="text-xs text-text-secondary">Scan someone else's code</span>
            </button>
          </div>
        </div>
      );
    }

    // Name step, shared by both host and guest.
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 py-10">
        <button onClick={() => setIntent("none")} className="self-start text-sm text-text-secondary hover:text-text-primary">
          ← Back
        </button>
        <h1 className="text-lg font-semibold text-text-primary">What should we call you?</h1>
        <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={40} autoFocus />
        <Button
          disabled={!nameInput.trim()}
          onClick={() => {
            if (intent === "host") startHosting(nameInput.trim());
            // guest role is set once they actually decode an offer, inside CodeEntry below
          }}
        >
          Continue
        </Button>

        {intent === "guest" && (
          <div className="mt-2">
            <p className="mb-2 text-sm font-medium text-text-primary">Scan the host's code</p>
            <CodeEntry
              title=""
              busy={connecting}
              onSubmit={async (code) => {
                if (!nameInput.trim()) {
                  toast("Enter your name first", "info");
                  return;
                }
                try {
                  const answer = await joinWithOfferCode(code, nameInput.trim());
                  setGuestAnswerCode(answer);
                } catch {
                  toast("That code didn't work. Ask for a fresh one.", "error");
                }
              }}
            />
          </div>
        )}
      </div>
    );
  }

  // --- Guest: connected to host, waiting for it to complete on their end ---
  if (role === "guest" && guestAnswerCode && peers[0]?.status !== "connected") {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-10">
        <InviteCodeDisplay code={guestAnswerCode} instructions="Show this to the host — they'll scan or type it to finish connecting you." />
        {error ? (
          <p className="text-center text-sm text-danger">{error}</p>
        ) : (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Spinner className="h-4 w-4" />
            Waiting to connect…
          </div>
        )}
        <Button variant="ghost" onClick={leaveSession}>
          Cancel
        </Button>
      </div>
    );
  }

  // --- Connected dashboard: shared shell for host and guest ---
  const connectedPeers = peers.filter((p) => p.status !== "connecting");
  const canBroadcast = connectedPeers.length > 0;

  const targetLabel = (target: string | "all") =>
    target === "all" ? "everyone" : connectedPeers.find((p) => p.id === target)?.name ?? "device";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChosen} />
      <ConfettiBurst active={celebrateConnection} onComplete={() => setCelebrateConnection(false)} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Local session</h1>
          <p className="text-sm text-text-secondary">{role === "host" ? "You're hosting" : "Connected as a guest"} · offline, no cloud</p>
        </div>
        <Button variant="secondary" size="sm" onClick={leaveSession} className="gap-1.5">
          <SignOut className="h-4 w-4" />
          Leave
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {canBroadcast && (
        <Card className="flex flex-col gap-3 border-brand/30 bg-brand-soft p-4">
          <div className="flex items-center gap-3">
            <Broadcast className="h-5 w-5 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">Send to everyone</p>
              <p className="text-xs text-text-secondary">Reaches every connected device in this session at once.</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => setComposeTarget("all")} className="gap-1.5">
                <ChatText className="h-3.5 w-3.5" />
                Text
              </Button>
              <Button size="sm" onClick={() => triggerSend("all")} loading={sending && sendTarget === "all"} className="gap-1.5">
                <UploadSimple className="h-3.5 w-3.5" />
                Send to all
              </Button>
            </div>
          </div>
          {sendProgress && sendProgress.target === "all" && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/40">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: `${Math.round((sendProgress.sent / Math.max(sendProgress.total, 1)) * 100)}%` }}
                />
              </div>
              <span className="shrink-0 text-xs text-text-secondary">
                {formatBytes(sendProgress.sent)} / {formatBytes(sendProgress.total)}
              </span>
            </div>
          )}
        </Card>
      )}

      {composeTarget && (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-primary">Send text or a link to {targetLabel(composeTarget)}</p>
            <button
              onClick={() => {
                setComposeTarget(null);
                setComposeText("");
              }}
              aria-label="Close"
              className="rounded-md p-1 text-text-secondary hover:bg-surface-hover"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={composeText}
            onChange={(e) => setComposeText(e.target.value)}
            placeholder="Type a message or paste a link…"
            rows={3}
            autoFocus
            className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          <Button
            size="sm"
            disabled={!composeText.trim()}
            loading={sendingText}
            onClick={submitText}
            className="ml-auto gap-1.5"
          >
            <PaperPlaneTilt className="h-3.5 w-3.5" />
            Send
          </Button>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Connected devices</h2>
        {connectedPeers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-secondary">
            No one's joined yet. {role === "host" ? "Invite a device below." : "Waiting for others…"}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {connectedPeers.map((peer) => (
              <div key={peer.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${peer.status === "connected" ? "bg-success" : "bg-text-secondary/40"}`} />
                  <span className="flex-1 truncate text-sm font-medium text-text-primary">{peer.name}</span>
                  {peer.status === "roster" && <span className="text-xs text-text-secondary">via host</span>}
                  {(peer.status === "connected" || role === "host") && (
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => setComposeTarget(peer.id)} className="gap-1.5">
                        <ChatText className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => triggerSend(peer.id)} loading={sending && sendTarget === peer.id} className="gap-1.5">
                        <UploadSimple className="h-3.5 w-3.5" />
                        Send
                      </Button>
                    </div>
                  )}
                </div>
                {sendProgress && sendProgress.target === peer.id && (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
                      <div
                        className="h-full bg-brand transition-all"
                        style={{ width: `${Math.round((sendProgress.sent / Math.max(sendProgress.total, 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs text-text-secondary">
                      {formatBytes(sendProgress.sent)} / {formatBytes(sendProgress.total)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {role === "host" && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-text-secondary">Invite another device</h2>
          {!pendingInviteCode ? (
            <Button variant="secondary" onClick={createInvite} loading={connecting} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Generate invite code
            </Button>
          ) : !answeringInvite ? (
            <Card className="flex flex-col items-center gap-4 p-6">
              <InviteCodeDisplay code={pendingInviteCode} instructions="Have the other device scan this, or use its text-code fallback." />
              <div className="flex gap-2">
                <Button variant="ghost" onClick={cancelInvite}>
                  Cancel
                </Button>
                <Button onClick={() => setAnsweringInvite(true)}>They scanned it — continue</Button>
              </div>
            </Card>
          ) : (
            <Card className="p-4">
              <CodeEntry
                title="Enter their response code"
                busy={connecting}
                onSubmit={async (code) => {
                  await completeInvite(code);
                  setAnsweringInvite(false);
                }}
              />
              <button
                type="button"
                onClick={() => setAnsweringInvite(false)}
                className="mt-3 text-xs font-medium text-text-secondary hover:text-text-primary"
              >
                Back to invite code
              </button>
            </Card>
          )}
        </section>
      )}

      <LocalIncomingTransfers />
    </div>
  );
}
