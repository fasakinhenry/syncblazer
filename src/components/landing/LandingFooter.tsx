import { Logo } from "@/components/Logo.tsx";

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-background py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left">
        <Logo />
        <p className="max-w-sm text-sm text-text-secondary">
          Local when possible. Cloud when necessary.
        </p>
        <p className="text-sm text-text-secondary">
          {new Date().getFullYear()} SyncBlaze
        </p>
      </div>
    </footer>
  );
}
