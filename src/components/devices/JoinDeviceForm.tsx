import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { api, ApiClientError } from "@/lib/api.ts";
import { detectDeviceInfo, setCurrentDevice } from "@/lib/deviceInfo.ts";
import type { Device } from "@/lib/types.ts";

export function JoinDeviceForm({ initialCode, onJoined }: { initialCode?: string; onJoined: (device: Device) => void }) {
  const [code, setCode] = useState(initialCode ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const trimmed = code.trim();
      const isToken = trimmed.length > 12;
      const result = await api.devices.consumePairingSession({
        [isToken ? "token" : "shortCode"]: trimmed,
        device: detectDeviceInfo(),
      });
      setCurrentDevice(result.device);
      setCode("");
      onJoined(result.device);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "That code didn't work. Ask for a new one.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Enter code e.g. 482-193"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="font-mono"
          required
        />
        <Button type="submit" variant="secondary" loading={loading} className="shrink-0">
          Join
        </Button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}
