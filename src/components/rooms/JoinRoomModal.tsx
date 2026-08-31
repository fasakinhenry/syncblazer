import { useEffect, useRef, useState, type FormEvent } from "react";
import QrScanner from "qr-scanner";
import QrScannerWorkerPath from "qr-scanner/qr-scanner-worker.min.js?url";
import { Camera, X } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { api, ApiClientError } from "@/lib/api.ts";
import type { Room } from "@/lib/types.ts";

QrScanner.WORKER_PATH = QrScannerWorkerPath;

interface JoinRoomModalProps {
  open: boolean;
  onClose: () => void;
  onJoined: (room: Room) => void;
}

export function JoinRoomModal({ open, onClose, onJoined }: JoinRoomModalProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);

  const close = () => {
    setCode("");
    setError(null);
    setScannerOpen(false);
    setScannerError(null);
    onClose();
  };

  useEffect(() => {
    if (!open || !scannerOpen || !videoRef.current) return;

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        const raw = result.data.trim();
        try {
          const url = new URL(raw);
          const fromQuery = url.searchParams.get("joinRoom");
          const value = fromQuery ?? raw;
          setCode(value);
        } catch {
          setCode(raw);
        }
        setScannerOpen(false);
        setScannerError(null);
      },
      {
        preferredCamera: "environment",
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true,
      }
    );

    scannerRef.current = scanner;
    scanner
      .start()
      .then(() => setScannerError(null))
      .catch(() => setScannerError("Camera access is unavailable. Please use the room code instead."));

    return () => {
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [open, scannerOpen]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { room } = await api.rooms.join(code);
      onJoined(room);
      close();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "That code didn't work");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Join a room">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label htmlFor="room-code" className="text-sm font-medium text-text-primary">
            Room code
          </label>
          <button
            type="button"
            onClick={() => setScannerOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface-hover"
          >
            {scannerOpen ? <X className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
            {scannerOpen ? "Close" : "Scan"}
          </button>
        </div>

        {scannerOpen ? (
          <div className="overflow-hidden rounded-xl border border-border bg-black/5">
            <video ref={videoRef} className="h-56 w-full bg-black object-cover" muted playsInline />
            {scannerError ? <p className="p-3 text-xs text-danger">{scannerError}</p> : null}
          </div>
        ) : null}

        <Input
          id="room-code"
          placeholder="amber-falcon-42"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="font-mono"
          required
          autoFocus
        />
        {scannerError ? <p className="text-xs text-danger">{scannerError}</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" loading={loading} disabled={!code.trim()}>
          Join room
        </Button>
      </form>
    </Modal>
  );
}
