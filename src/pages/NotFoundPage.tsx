import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button.tsx";

export function NotFoundPage() {
  // The server always returns 200 for this SPA (Vercel rewrites every
  // unmatched path to index.html), so this is the only signal search
  // engines get that there's nothing real here. Restored on unmount so a
  // real page visited right after doesn't inherit it.
  useEffect(() => {
    const robotsTag = document.querySelector('meta[name="robots"]');
    const previous = robotsTag?.getAttribute("content") ?? null;
    robotsTag?.setAttribute("content", "noindex, nofollow");
    return () => {
      if (previous !== null) robotsTag?.setAttribute("content", previous);
    };
  }, []);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background text-center">
      <p className="font-display text-5xl font-medium text-brand">404</p>
      <p className="text-text-secondary">This page doesn't exist.</p>
      <Link to="/">
        <Button>Go home</Button>
      </Link>
    </div>
  );
}
