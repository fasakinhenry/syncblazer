import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { useAuth } from "@/context/AuthContext.tsx";
import { ApiClientError } from "@/lib/api.ts";

interface GuestUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  onUpgraded?: () => void;
}

/** Converts the current guest account into a real one, in place — same
 * user id, so every room/note/device already attached stays attached
 * (unlike sending a guest to /register, which would be unreachable anyway
 * since GuestRoute redirects any already-authenticated user, guests
 * included, away from it). This is what a guest blocked from editing a
 * shared note gets pointed at. */
export function GuestUpgradeModal({ open, onClose, onUpgraded }: GuestUpgradeModalProps) {
  const { user, upgradeGuest } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await upgradeGuest({ name: name.trim() || undefined, email, password });
      onUpgraded?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create your account">
      <p className="mb-4 text-sm text-text-secondary">
        Keep everything you've already got — your notes, devices, and rooms carry straight over. This just adds a
        real sign-in so you can collaborate with others.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="upgrade-name" className="mb-1.5 block text-sm font-medium text-text-primary">
            Name
          </label>
          <Input id="upgrade-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="upgrade-email" className="mb-1.5 block text-sm font-medium text-text-primary">
            Email
          </label>
          <Input
            id="upgrade-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="upgrade-password" className="mb-1.5 block text-sm font-medium text-text-primary">
            Password
          </label>
          <Input
            id="upgrade-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1 text-xs text-text-secondary">At least 8 characters.</p>
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Button type="submit" loading={loading} className="w-full">
          Create account
        </Button>
      </form>
    </Modal>
  );
}
