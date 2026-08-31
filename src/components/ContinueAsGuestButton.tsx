import { useState } from "react";
import { UserCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button.tsx";
import { useAuth } from "@/context/AuthContext.tsx";
import { ApiClientError } from "@/lib/api.ts";

interface ContinueAsGuestButtonProps {
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function ContinueAsGuestButton({ onSuccess, onError }: ContinueAsGuestButtonProps) {
  const { continueAsGuest } = useAuth();
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      await continueAsGuest();
      onSuccess();
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : "We couldn't start a guest session. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="secondary" size="lg" onClick={onClick} loading={loading} className="w-full gap-2">
      <UserCircle className="h-5 w-5" />
      Continue as guest
    </Button>
  );
}
