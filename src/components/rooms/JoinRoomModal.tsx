import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { api, ApiClientError } from "@/lib/api.ts";
import type { Room } from "@/lib/types.ts";

interface JoinRoomModalProps {
  open: boolean;
  onClose: () => void;
  onJoined: (room: Room) => void;
}

export function JoinRoomModal({ open, onClose, onJoined }: JoinRoomModalProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setCode("");
    setError(null);
    onClose();
  };

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
        <label htmlFor="room-code" className="text-sm font-medium text-text-primary">
          Room code
        </label>
        <Input
          id="room-code"
          placeholder="amber-falcon-42"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="font-mono"
          required
          autoFocus
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" loading={loading} disabled={!code.trim()}>
          Join room
        </Button>
      </form>
    </Modal>
  );
}
