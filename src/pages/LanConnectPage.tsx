import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Broadcast, ChatText, Monitor, PaperPlaneTilt, SignOut, UploadSimple, X } from "@phosphor-icons/react";
import { useLanPair } from "@/context/LanPairContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { detectDeviceInfo } from "@/lib/deviceInfo.ts";
import { formatBytes } from "@/lib/format.ts";
import { isTauri } from "@/lib/tauri.ts";
import { LocalQrScanner } from "@/components/localSession/LocalQrScanner.tsx";
import { LanPairIncomingTransfers } from "@/components/quickConnect/LanPairIncomingTransfers.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { ConfettiBurst } from "@/components/ConfettiBurst.tsx";

const URL_PATTERN = /^https?:\/\/\S+$/i;

function suggestedName(): string {
  return detectDeviceInfo().name;
}

export function LanConnectPage() {
  const { role, qrUrl, peers, connecting, error, startHosting, joinViaUrl, leaveSession, sendFile, sendText } = useLanPair();
  const { toast } = useToast();
  const inDesktopApp = isTauri();

  const [nameInput, setNameInput] = useState(suggestedName());
  const [started, setStarted] = useState(false);
  const [sendTarget, setSendTarget] = useState<string | "all" | null>(null);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ target: string; sent: number; total: number } | null>(null);
  const [composeTarget, setComposeTarget] = useState<string | "all" | null>(null);
  const [composeText, setComposeText] = useState("");
  const [sendingText, setSendingText] = useState(false);
  const [celebrateConnection, setCelebrateConnection] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const knownConnectedIdsRef = useRef<Set<string>>(new Set());

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
      await sendFile(target, file, kind, (sentBytes, totalBytes) => setSendProgress({ target, sent: sentBytes, total: totalBytes }));
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

  const onScanResult = async (text: string) => {
    if (!text.startsWith("ws://") && !text.startsWith("wss://")) {
      toast("That's not a SyncBlaze desktop code", "error");
      return;
    }
    if (!nameInput.trim()) {
      toast("Enter your name first", "info");
      return;
    }
    try {
      await joinViaUrl(text, nameInput.trim());
    } catch {
      toast("Couldn't connect to that device", "error");
    }
  };

  // --- Not started yet ---
  if (role === "none") {
    if (!started) {
      return (
        <div className="mx-auto flex max-w-sm flex-col gap-4 py-10">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <Monitor className="h-7 w-7" />
          </span>
          <h1 className="text-center text-lg font-semibold text-text-primary">
            {inDesktopApp ? "Host a local session" : "Scan a desktop's code"}
          </h1>
          <p className="text-center text-sm text-text-secondary">
            {inDesktopApp
              ? "Your phone scans a code shown here to connect directly over Wi-Fi — no internet, no camera needed on this computer."
              : "Scan the QR code shown on the SyncBlaze desktop app. This works even with zero internet, as long as you're on the same Wi-Fi or hotspot."}
          </p>
          <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={40} autoFocus placeholder="Your name" />
          {inDesktopApp ? (
            <Button
              disabled={!nameInput.trim()}
              loading={connecting}
              onClick={async () => {
                setStarted(true);
                try {
                  await startHosting(nameInput.trim());
                } catch {
                  setStarted(false);
                }
              }}
            >
              Start session
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-text-secondary">Point your camera at the desktop's code</p>
              <LocalQrScanner active onResult={onScanResult} />
            </div>
          )}
          {error && <p className="text-center text-sm text-danger">{error}</p>}
        </div>
      );
    }
  }

  // --- Host: waiting for the first guest ---
  if (role === "host" && qrUrl && peers.length === 0) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-10 text-center">
        <div className="relative rounded-xl border border-border bg-white p-3">
          <span className="absolute -inset-1 -z-10 animate-pulse rounded-2xl bg-brand/20" aria-hidden="true" />
          <QRCodeSVG value={qrUrl} size={200} />
        </div>
        <p className="text-sm text-text-secondary">
          Scan this from your phone's SyncBlaze app — Local Transfer → Desktop App. No internet needed.
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button variant="ghost" onClick={leaveSession}>
          Cancel
        </Button>
      </div>
    );
  }

  // --- Connected dashboard ---
  const connectedPeers = peers.filter((p) => p.status === "connected");
  const canBroadcast = connectedPeers.length > 0;
  const targetLabel = (target: string | "all") => (target === "all" ? "everyone" : connectedPeers.find((p) => p.id === target)?.name ?? "device");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChosen} />
      <ConfettiBurst active={celebrateConnection} onComplete={() => setCelebrateConnection(false)} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Desktop App session</h1>
          <p className="text-sm text-text-secondary">Local network only · no internet, no cloud</p>
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
                <div className="h-full bg-brand transition-all" style={{ width: `${Math.round((sendProgress.sent / Math.max(sendProgress.total, 1)) * 100)}%` }} />
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
            <button onClick={() => { setComposeTarget(null); setComposeText(""); }} aria-label="Close" className="rounded-md p-1 text-text-secondary hover:bg-surface-hover">
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
          <Button size="sm" disabled={!composeText.trim()} loading={sendingText} onClick={submitText} className="ml-auto gap-1.5">
            <PaperPlaneTilt className="h-3.5 w-3.5" />
            Send
          </Button>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Connected devices</h2>
        {connectedPeers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-secondary">No one's joined yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {connectedPeers.map((peer) => (
              <div key={peer.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
                  <span className="flex-1 truncate text-sm font-medium text-text-primary">{peer.name}</span>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setComposeTarget(peer.id)} className="gap-1.5">
                      <ChatText className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => triggerSend(peer.id)} loading={sending && sendTarget === peer.id} className="gap-1.5">
                      <UploadSimple className="h-3.5 w-3.5" />
                      Send
                    </Button>
                  </div>
                </div>
                {sendProgress && sendProgress.target === peer.id && (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
                      <div className="h-full bg-brand transition-all" style={{ width: `${Math.round((sendProgress.sent / Math.max(sendProgress.total, 1)) * 100)}%` }} />
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

      <LanPairIncomingTransfers />
    </div>
  );
}
