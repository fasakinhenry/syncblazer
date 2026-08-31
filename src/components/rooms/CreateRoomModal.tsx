import { useState, type FormEvent } from "react";
import { Fire } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { api, ApiClientError } from "@/lib/api.ts";
import type { Room } from "@/lib/types.ts";

interface CreateRoomModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (room: Room) => void;
}

export function CreateRoomModal({ open, onClose, onCreated }: CreateRoomModalProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [instantLoading, setInstantLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setName("");
    setError(null);
    onClose();
  };

  const createNamed = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { room } = await api.rooms.create({ name, type: "shared" });
      onCreated(room);
      close();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't create the room");
    } finally {
      setLoading(false);
    }
  };

  const createInstant = async () => {
    setError(null);
    setInstantLoading(true);
    try {
      const { room } = await api.rooms.createInstant();
      onCreated(room);
      close();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't create the room");
    } finally {
      setInstantLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Create a room">
      <form onSubmit={createNamed} className="flex flex-col gap-3">
        <label htmlFor="room-name" className="text-sm font-medium text-text-primary">
          Room name
        </label>
        <Input
          id="room-name"
          placeholder="Family photos, Hackathon, ..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          autoFocus
        />
        <Button type="submit" loading={loading} disabled={!name.trim()}>
          Create room
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <hr className="flex-1 border-border" />
        <span className="text-xs uppercase tracking-wider text-text-secondary">or</span>
        <hr className="flex-1 border-border" />
      </div>

      <Button variant="secondary" onClick={createInstant} loading={instantLoading} className="w-full gap-2">
        <Fire className="h-4 w-4" />
        Generate an instant room
      </Button>
      <p className="mt-2 text-xs text-text-secondary">
        A quick, auto-named room for a one-off share. It disappears after 12 hours.
      </p>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </Modal>
  );
}
