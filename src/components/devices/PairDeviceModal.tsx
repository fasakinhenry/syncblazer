import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, ArrowClockwise } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Spinner } from "@/components/ui/Spinner.tsx";
import { api, ApiClientError } from "@/lib/api.ts";
import { useSocket } from "@/context/SocketContext.tsx";
import type { Device } from "@/lib/types.ts";

interface PairDeviceModalProps {
  open: boolean;
  onClose: () => void;
  roomId: string | undefined;
  onPaired: (device: Device) => void;
}

export function PairDeviceModal({ open, onClose, roomId, onPaired }: PairDeviceModalProps) {
  const { socket } = useSocket();
  const [session, setSession] = useState<{ token: string; shortCode: string; expiresAt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paired, setPaired] = useState<Device | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const generateSession = async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    setPaired(null);
    try {
      const result = await api.devices.createPairingSession(roomId);
      setSession(result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't generate a pairing code");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void generateSession();
    if (!open) {
      setSession(null);
      setPaired(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roomId]);

  useEffect(() => {
    if (!session) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((new Date(session.expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { device: Device }) => {
      setPaired(payload.device);
      onPaired(payload.device);
    };
    socket.on("pairing:completed", handler);
    return () => {
      socket.off("pairing:completed", handler);
    };
  }, [socket, onPaired]);

  const joinUrl = session ? `${window.location.origin}/devices?join=${session.token}` : "";

  return (
    <Modal open={open} onClose={onClose} title="Connect a device">
      {paired ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <Check className="h-6 w-6" />
          </div>
          <p className="font-medium text-text-primary">{paired.name} connected</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : loading || !session ? (
        <div className="flex items-center justify-center py-10">
          {error ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-danger">{error}</p>
              <Button variant="secondary" onClick={generateSession}>
                Try again
              </Button>
            </div>
          ) : (
            <Spinner className="h-6 w-6" />
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-xl border border-border bg-white p-4">
            <QRCodeSVG value={joinUrl} size={180} />
          </div>
          <p className="text-center text-sm text-text-secondary">
            Scan with your other device's camera, or open SyncBlaze there and enter the code below.
          </p>
          <div className="rounded-lg bg-surface-hover px-4 py-2 text-center font-mono text-xl tracking-widest text-text-primary">
            {session.shortCode}
          </div>
          <p className="text-xs text-text-secondary">
            {secondsLeft > 0 ? `Expires in ${secondsLeft}s` : "Expired"}
          </p>
          <Button variant="ghost" size="sm" onClick={generateSession} className="gap-1.5">
            <ArrowClockwise className="h-3.5 w-3.5" />
            New code
          </Button>
        </div>
      )}
    </Modal>
  );
}
