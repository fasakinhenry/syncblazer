import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button.tsx";

export function NotFoundPage() {
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
