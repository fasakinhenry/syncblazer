import { useEffect, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Check, File as FileIcon, Fire, Image as ImageIcon, LinkSimple, TextAa, UploadSimple } from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api.ts";
import type { Device, TransferType } from "@/lib/types.ts";
import { useRooms } from "@/context/RoomContext.tsx";
import { usePeerTransfer } from "@/context/PeerTransferContext.tsx";
import { getCurrentDevice } from "@/lib/deviceInfo.ts";
import { formatBytes } from "@/lib/format.ts";
import { Button } from "@/components/ui/Button.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";
import { DEVICE_TYPE_ICON } from "@/components/devices/deviceIcons.tsx";

type ContentType = TransferType;
type Step = "select" | "compose" | "sending" | "done";

const TYPE_TILES: { type: ContentType; label: string; icon: typeof FileIcon }[] = [
  { type: "file", label: "File", icon: FileIcon },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "text", label: "Text", icon: TextAa },
  { type: "link", label: "Link", icon: LinkSimple },
];

export function QuickBlazePage() {
  const { defaultRoom } = useRooms();
  const { sendFile: sendFileP2P, sendText: sendTextP2P } = usePeerTransfer();
  const navigate = useNavigate();
  const currentDevice = getCurrentDevice();

  const [step, setStep] = useState<Step>("select");
  const [contentType, setContentType] = useState<ContentType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [lastMethod, setLastMethod] = useState<"local" | "cloud" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.devices.list().then(({ devices }) => {
      const others = devices.filter((d) => d._id !== currentDevice?._id);
      setDevices(others);
      if (others.length === 1) setDestinationId(others[0]._id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectType = (type: ContentType) => {
    setContentType(type);
    setStep("compose");
    setError(null);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (!dropped) return;
    setFile(dropped);
    setContentType(dropped.type.startsWith("image/") ? "image" : "file");
    setStep("compose");
  };

  const reset = () => {
    setStep("select");
    setContentType(null);
    setFile(null);
    setText("");
    setLink("");
    setDestinationId(devices.length === 1 ? devices[0]._id : null);
    setProgress(0);
    setError(null);
    setLastMethod(null);
  };

  const canSend =
    !!destinationId &&
    !!defaultRoom &&
    !!currentDevice &&
    ((contentType === "file" && !!file) ||
      (contentType === "image" && !!file) ||
      (contentType === "text" && text.trim().length > 0) ||
      (contentType === "link" && link.trim().length > 0));

  const send = async () => {
    if (!canSend || !contentType || !defaultRoom || !currentDevice || !destinationId) return;
    setStep("sending");
    setError(null);
    setProgress(0);

    const destinationDevice = devices.find((d) => d._id === destinationId);
    const canAttemptP2P = destinationDevice?.status === "online";

    try {
      let transferId: string;
      let transferMethod: "local" | "cloud" = "cloud";

      if (contentType === "file" || contentType === "image") {
        const p2p = canAttemptP2P
          ? await sendFileP2P(destinationId, file!, contentType, (sent, total) =>
              setProgress(Math.round((sent / total) * 100))
            )
          : { ok: false };

        if (p2p.ok) {
          transferMethod = "local";
          const { transfer } = await api.transfers.create({
            roomId: defaultRoom._id,
            senderDeviceId: currentDevice._id,
            receiverDeviceId: destinationId,
            type: contentType,
            name: file!.name,
            size: file!.size,
            mimeType: file!.type,
            transferMethod,
          });
          transferId = transfer._id;
        } else {
          setProgress(0);
          const uploaded = await api.uploads.uploadWithProgress(file!, setProgress);
          const { transfer } = await api.transfers.create({
            roomId: defaultRoom._id,
            senderDeviceId: currentDevice._id,
            receiverDeviceId: destinationId,
            type: contentType,
            name: file!.name,
            size: uploaded.size,
            mimeType: uploaded.mimeType,
            storageKey: uploaded.key,
            transferMethod: "cloud",
          });
          transferId = transfer._id;
        }
      } else {
        const value = contentType === "text" ? text : link;
        const name = contentType === "link" ? value.slice(0, 80) : value.split("\n")[0].slice(0, 80) || "Text";

        const p2p = canAttemptP2P ? await sendTextP2P(destinationId, value, contentType, name) : { ok: false };
        if (p2p.ok) transferMethod = "local";

        const { transfer } = await api.transfers.create({
          roomId: defaultRoom._id,
          senderDeviceId: currentDevice._id,
          receiverDeviceId: destinationId,
          type: contentType,
          name,
          textContent: value,
          transferMethod,
        });
        transferId = transfer._id;
        setProgress(100);
      }

      await api.transfers.updateStatus(transferId, { status: "completed", progress: 100 });
      setLastMethod(transferMethod);
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "We couldn't send that. Please try again.");
      setStep("compose");
    }
  };

  return (
    <div
      className="mx-auto flex max-w-xl flex-col gap-6"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Quick Blaze</h1>
        <p className="text-sm text-text-secondary">Move something to another device, instantly.</p>
      </div>

      {dragging && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-brand/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand bg-surface px-10 py-8">
            <UploadSimple className="h-8 w-8 text-brand" />
            <p className="font-medium text-brand">Drop to Blaze</p>
          </div>
        </div>
      )}

      {step === "select" && (
        <div className="grid grid-cols-2 gap-3">
          {TYPE_TILES.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => selectType(type)}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-6 transition-colors hover:border-brand hover:bg-brand-soft"
            >
              <Icon className="h-6 w-6 text-brand" />
              <span className="font-medium text-text-primary">{label}</span>
            </button>
          ))}
        </div>
      )}

      {step === "compose" && contentType && (
        <div className="flex flex-col gap-5">
          {(contentType === "file" || contentType === "image") && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept={contentType === "image" ? "image/*" : undefined}
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center hover:border-brand"
              >
                <UploadSimple className="h-6 w-6 text-text-secondary" />
                {file ? (
                  <span className="text-sm text-text-primary">
                    {file.name} · {formatBytes(file.size)}
                  </span>
                ) : (
                  <span className="text-sm text-text-secondary">
                    Click to choose, or drag a {contentType === "image" ? "image" : "file"} anywhere on this page
                  </span>
                )}
              </button>
            </div>
          )}

          {contentType === "text" && (
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type or paste anything…"
              className="min-h-32 resize-none rounded-xl border border-border bg-surface p-4 text-sm text-text-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          )}

          {contentType === "link" && (
            <input
              autoFocus
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
              className="h-11 rounded-xl border border-border bg-surface px-4 text-sm text-text-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">Send to</p>
            {devices.length === 0 ? (
              <EmptyState title="No other devices" description="Connect another device first." />
            ) : (
              <div className="flex flex-col gap-2">
                {devices.map((device) => {
                  const Icon = DEVICE_TYPE_ICON[device.type];
                  const selected = destinationId === device._id;
                  return (
                    <button
                      key={device._id}
                      onClick={() => setDestinationId(device._id)}
                      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                        selected ? "border-brand bg-brand-soft" : "border-border hover:bg-surface-hover"
                      }`}
                    >
                      <Icon className="h-5 w-5 text-text-secondary" />
                      <span className="flex-1 font-medium text-text-primary">{device.name}</span>
                      <span className={`h-2 w-2 rounded-full ${device.status === "online" ? "bg-success" : "bg-text-secondary/40"}`} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button onClick={send} disabled={!canSend} className="flex-1 gap-1.5">
              <Fire className="h-4 w-4" />
              Blaze{destinationId ? ` to ${devices.find((d) => d._id === destinationId)?.name}` : ""}
            </Button>
          </div>
        </div>
      )}

      {step === "sending" && (
        <Card className="flex flex-col items-center gap-4 p-10 text-center">
          <Fire className="h-10 w-10 animate-pulse text-brand" />
          <p className="font-medium text-text-primary">Sending…</p>
          {(contentType === "file" || contentType === "image") && (
            <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-hover">
              <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </Card>
      )}

      {step === "done" && (
        <Card className="flex flex-col items-center gap-4 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <Check className="h-6 w-6" />
          </div>
          <p className="font-medium text-text-primary">Blazed successfully</p>
          <p className="text-sm text-text-secondary">
            {lastMethod === "local" ? "Sent directly, device to device" : "Sent via cloud relay"}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate("/room")}>
              Back to Room
            </Button>
            <Button onClick={reset}>Blaze another</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
