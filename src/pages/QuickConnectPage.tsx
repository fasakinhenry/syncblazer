import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Broadcast,
  Camera,
  ChatText,
  Copy,
  CloudCheck,
  PaperPlaneTilt,
  Plus,
  ShareNetwork,
  SignOut,
  TextAa,
  UploadSimple,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { useQuickPair } from "@/context/QuickPairContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { detectDeviceInfo } from "@/lib/deviceInfo.ts";
import { formatBytes } from "@/lib/format.ts";
import { LocalQrScanner } from "@/components/localSession/LocalQrScanner.tsx";
import { QuickPairIncomingTransfers } from "@/components/quickConnect/QuickPairIncomingTransfers.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { ConfettiBurst } from "@/components/ConfettiBurst.tsx";

const QR_PREFIX = "syncblaze-quickpair:";
const URL_PATTERN = /^https?:\/\/\S+$/i;
const canShare = typeof navigator !== "undefined" && "share" in navigator;

function suggestedName(): string {
  return detectDeviceInfo().name;
}

function normalizeCode(raw: string): string {
  const digits = raw.replace(QR_PREFIX, "").replace(/\D/g, "").slice(0, 6);
  return digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
}

export function QuickConnectPage() {
  const { role, code, peers, connecting, error, startSession, joinSession, leaveSession, sendFile, sendText } = useQuickPair();
  const { toast } = useToast();

  const [nameInput, setNameInput] = useState(suggestedName());
  const [intent, setIntent] = useState<"none" | "host" | "guest">("none");
  const [joinMode, setJoinMode] = useState<"scan" | "type">("scan");
  const [typedCode, setTypedCode] = useState("");
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

  const doJoin = async (rawCode: string) => {
    const normalized = normalizeCode(rawCode);
    if (normalized.length < 7) {
      toast("That code looks incomplete", "info");
      return;
    }
    if (!nameInput.trim()) {
      toast("Enter your name first", "info");
      return;
    }
    try {
      await joinSession(normalized, nameInput.trim());
    } catch {
      toast("That code didn't work. Ask for a fresh one.", "error");
    }
  };

  const shareCode = () => {
    if (!code) return;
    navigator.share({ title: "SyncBlaze Quick Connect", text: `Join my SyncBlaze session: ${code}` }).catch(() => undefined);
  };

  const copyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    toast("Code copied", "success");
  };

  // --- Not in a session yet ---
  if (role === "none") {
    if (intent === "none") {
      return (
        <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <CloudCheck className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Quick Connect</h1>
            <p className="mt-2 text-sm text-text-secondary">
              A short code connects two devices instantly, even on different networks. It only uses the internet
              for this brief handshake — every file still transfers directly between your devices, never through
              our servers.
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={() => setIntent("host")}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-6 hover:border-brand hover:bg-brand-soft"
            >
              <Plus className="h-6 w-6 text-brand" />
              <span className="font-medium text-text-primary">Start a session</span>
              <span className="text-xs text-text-secondary">Get a code for others to join</span>
            </button>
            <button
              onClick={() => setIntent("guest")}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-6 hover:border-brand hover:bg-brand-soft"
            >
              <UsersThree className="h-6 w-6 text-brand" />
              <span className="font-medium text-text-primary">Join a session</span>
              <span className="text-xs text-text-secondary">Scan or type someone's code</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 py-10">
        <button onClick={() => setIntent("none")} className="self-start text-sm text-text-secondary hover:text-text-primary">
          ← Back
        </button>
        <h1 className="text-lg font-semibold text-text-primary">What should we call you?</h1>
        <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={40} autoFocus />

        {intent === "host" ? (
          <Button disabled={!nameInput.trim()} loading={connecting} onClick={() => startSession(nameInput.trim())}>
            Continue
          </Button>
        ) : (
          <div className="mt-2 flex flex-col gap-3">
            <div className="flex gap-1">
              <button
                onClick={() => setJoinMode("scan")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${joinMode === "scan" ? "bg-brand-soft text-brand" : "bg-surface-hover text-text-secondary"}`}
              >
                <Camera className="h-4 w-4" />
                Scan
              </button>
              <button
                onClick={() => setJoinMode("type")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${joinMode === "type" ? "bg-brand-soft text-brand" : "bg-surface-hover text-text-secondary"}`}
              >
                <TextAa className="h-4 w-4" />
                Type code
              </button>
            </div>

            {joinMode === "scan" ? (
              <LocalQrScanner active={joinMode === "scan"} onResult={doJoin} />
            ) : (
              <div className="flex gap-2">
                <Input
                  value={typedCode}
                  onChange={(e) => setTypedCode(normalizeCode(e.target.value))}
                  placeholder="482-193"
                  className="text-center font-mono text-lg tracking-widest"
                  maxLength={7}
                />
                <Button loading={connecting} disabled={typedCode.length < 7} onClick={() => doJoin(typedCode)}>
                  Join
                </Button>
              </div>
            )}
            {error && <p className="text-center text-sm text-danger">{error}</p>}
          </div>
        )}
      </div>
    );
  }

  // --- Host: waiting for the first guest ---
  if (role === "host" && code && peers.length === 0) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-10 text-center">
        <div className="relative rounded-xl border border-border bg-white p-3">
          <span className="absolute -inset-1 -z-10 animate-pulse rounded-2xl bg-brand/20" aria-hidden="true" />
          <QRCodeSVG value={`${QR_PREFIX}${code}`} size={200} />
        </div>
        <p className="font-mono text-2xl font-semibold tracking-widest text-text-primary">{code}</p>
        <p className="text-sm text-text-secondary">Have the other device scan this, or type the code in.</p>
        <div className="flex flex-wrap justify-center gap-2">
          {canShare && (
            <Button size="sm" variant="secondary" onClick={shareCode} className="gap-1.5">
              <ShareNetwork className="h-3.5 w-3.5" />
              Share
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={copyCode} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" />
            Copy code
          </Button>
        </div>
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
          <h1 className="text-xl font-semibold text-text-primary">Quick Connect</h1>
          <p className="text-sm text-text-secondary">Code {code} · files transfer directly, never through our servers</p>
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
              <p className="text-xs text-text-secondary">Reaches every connected device at once.</p>
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-secondary">Connected devices</h2>
          {role === "host" && (
            <span className="font-mono text-xs text-text-secondary">
              Code: <span className="font-semibold text-text-primary">{code}</span>
            </span>
          )}
        </div>
        {connectedPeers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-secondary">
            No one's joined yet.
          </p>
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

      <QuickPairIncomingTransfers />
    </div>
  );
}
