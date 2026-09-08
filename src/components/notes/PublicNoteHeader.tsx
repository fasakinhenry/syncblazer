import { Link } from "react-router-dom";
import { Fire, SignIn } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext.tsx";
import { Avatar } from "@/components/Avatar.tsx";
import { Button } from "@/components/ui/Button.tsx";

/** Header for the public note surfaces (the anonymous /n/:token view and
 * SharedNoteWorkspace) — a login CTA for a signed-out visitor (this is
 * often someone's first-ever encounter with SyncBlaze, and they should be
 * able to sign in from right here, not just once they realize they need
 * edit access), or their own avatar linking to their profile once they are. */
export function PublicNoteHeader() {
  const { status, user } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-4 md:px-8">
      <Link to="/" className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand">
          <Fire weight="fill" className="h-4 w-4 text-white" />
        </span>
        <span className="font-display text-base font-semibold text-text-primary">SyncBlaze</span>
      </Link>

      {status === "authenticated" && user ? (
        <Link to="/profile" title={user.name}>
          <Avatar name={user.name} src={user.avatarUrl} className="h-8 w-8 text-xs" />
        </Link>
      ) : status === "unauthenticated" ? (
        <Link to="/login">
          <Button size="sm" variant="secondary" className="gap-1.5">
            <SignIn className="h-3.5 w-3.5" />
            Log in
          </Button>
        </Link>
      ) : null}
    </header>
  );
}
