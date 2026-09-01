import { useRef, useState, type ChangeEvent } from "react";
import { Broadcast, Plus, QrCode, SignOut, UploadSimple, UsersThree, WifiHigh } from "@phosphor-icons/react";
import { useLocalSession } from "@/context/LocalSessionContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { detectDeviceInfo } from "@/lib/deviceInfo.ts";
import { InviteCodeDisplay } from "@/components/localSession/InviteCodeDisplay.tsx";
import { CodeEntry } from "@/components/localSession/CodeEntry.tsx";
import { LocalIncomingTransfers } from "@/components/localSession/LocalIncomingTransfers.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { Spinner } from "@/components/ui/Spinner.tsx";

function suggestedName(): string {
  return detectDeviceInfo().name;
}

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
    leaveSession,
  } = useLocalSession();
  const { toast } = useToast();

  const [nameInput, setNameInput] = useState(suggestedName());
  const [intent, setIntent] = useState<"none" | "host" | "guest">("none");
  const [answeringInvite, setAnsweringInvite] = useState(false);
  const [guestAnswerCode, setGuestAnswerCode] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<string | "all" | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    try {
      await sendFile(target, file, kind);
      toast(target === "all" ? `Sent "${file.name}" to everyone` : `Sent "${file.name}"`, "success");
    } catch {
      toast("Couldn't send that file", "error");
    } finally {
      setSending(false);
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
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Spinner className="h-4 w-4" />
          Waiting to connect…
        </div>
        <Button variant="ghost" onClick={leaveSession}>
          Cancel
        </Button>
      </div>
    );
  }

  // --- Connected dashboard: shared shell for host and guest ---
  const connectedPeers = peers.filter((p) => p.status !== "connecting");
  const canBroadcast = connectedPeers.length > 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChosen} />

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
        <Card className="flex items-center gap-3 border-brand/30 bg-brand-soft p-4">
          <Broadcast className="h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary">Send to everyone</p>
            <p className="text-xs text-text-secondary">Reaches every connected device in this session at once.</p>
          </div>
          <Button size="sm" onClick={() => triggerSend("all")} loading={sending} className="shrink-0 gap-1.5">
            <UploadSimple className="h-3.5 w-3.5" />
            Send to all
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
              <div key={peer.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
                <span className={`h-2 w-2 shrink-0 rounded-full ${peer.status === "connected" ? "bg-success" : "bg-text-secondary/40"}`} />
                <span className="flex-1 truncate text-sm font-medium text-text-primary">{peer.name}</span>
                {peer.status === "roster" && <span className="text-xs text-text-secondary">via host</span>}
                {(peer.status === "connected" || role === "host") && (
                  <Button size="sm" variant="secondary" onClick={() => triggerSend(peer.id)} loading={sending && sendTarget === peer.id} className="shrink-0 gap-1.5">
                    <UploadSimple className="h-3.5 w-3.5" />
                    Send
                  </Button>
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
