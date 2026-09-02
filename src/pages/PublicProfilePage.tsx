import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Fire } from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api.ts";
import { Avatar } from "@/components/Avatar.tsx";
import { Badge } from "@/components/ui/Badge.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";

type PublicProfile = { id: string; name: string; avatarUrl?: string; isGuest: boolean };

export function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    api.users
      .getPublic(userId)
      .then(({ user }) => setProfile(user))
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "This profile isn't available."));
  }, [userId]);

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border px-4 py-4 md:px-8">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand">
            <Fire weight="fill" className="h-4 w-4 text-white" />
          </span>
          <span className="font-display text-base font-semibold text-text-primary">SyncBlaze</span>
        </Link>
      </header>

      <main className="mx-auto max-w-sm px-4 py-16">
        {error ? (
          <EmptyState title="Profile unavailable" description={error} />
        ) : !profile ? (
          <PageSpinner />
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <Avatar name={profile.name} src={profile.avatarUrl} className="h-20 w-20 text-3xl" />
            <div>
              <div className="flex items-center justify-center gap-2">
                <p className="text-lg font-semibold text-text-primary">{profile.name}</p>
                {profile.isGuest && <Badge tone="brand">Guest</Badge>}
              </div>
              <p className="mt-1 text-sm text-text-secondary">is on SyncBlaze</p>
            </div>
            <Link to="/register">
              <Button className="gap-2">Join them on SyncBlaze</Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
